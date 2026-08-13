# Timeout - Decky Loader Plugin
# Python Backend

from settings import SettingsManager
from datetime import datetime, timedelta
import time
import os
import signal
import re
import decky 
import asyncio
import uuid
import json
import fcntl
import struct

# Initialize settings
settingsDir = os.environ["DECKY_PLUGIN_SETTINGS_DIR"]
runtimeDir = os.environ["DECKY_PLUGIN_RUNTIME_DIR"]
decky.logger.info(f'Timeout: Settings path = {os.path.join(settingsDir, "settings.json")}')
decky.logger.info(f"Timeout: Runtime data path = {runtimeDir}")
settings = SettingsManager(name="settings", settings_directory=settingsDir)
settings.read()

# Settings keys
SETTINGS_KEY_SETTINGS = "user_settings"
SETTINGS_KEY_FOCUS = "focus_state"
SETTINGS_KEY_GAME_LIMITS = "game_limits_state"

# Limits to prevent excessive data

# Default user settings
DEFAULT_SETTINGS = {
    "time_format_24h": True,
    # Focus settings
    "focus_sound": "alarm.mp3",
    "focus_volume": 100,
    "focus_subtle_mode": False,
    "focus_prevent_sleep": False,
    "focus_work_duration": 25,  # minutes
    "focus_break_duration": 5,  # minutes
    "focus_long_break_duration": 15,  # minutes
    "focus_sessions_until_long_break": 4,
    # Missed Alerts settings
    "missed_alerts_enabled": True,
    "missed_alerts_window": 24,
    "focus_suspend_behavior": "continue",
    # Alert interaction delay (seconds before gaming popups accept input)
    "snooze_activation_delay": 2.0,
    # Overlay settings
    "overlay_enabled": False,
    "overlay_display_mode": "both",
    "overlay_position": "default",
    "overlay_custom_x": 10,
    "overlay_custom_y": 12,
    "overlay_text_size": 13,
    "overlay_opacity": 0.4,
    "overlay_max_alerts": 2,
    "overlay_time_window": 1,
    "overlay_show_focus": True,
    "overlay_compact_mode": False,
    "overlay_show_prevent_sleep_badge": True,
    "overlay_show_missed_badge": True,
    # Tab Order
    "tab_order": ["focus"],
    # Game Limits (sub-project B) — disabled by default
    "game_limits_config": {
        "enabled": False,
        "mode": "blacklist",  # "whitelist" | "blacklist"
        "global": {
            "opens_enabled": False,
            "opens_per_day": 3,
            "opens_bypass_curfew": False,
            "time_enabled": False,
            "time_cap_minutes": 20,
            "half_open_cap_minutes": 10,
            "curfew_enabled": False,
            "curfew_start": "00:00",
            "curfew_end": "05:00",
            "curfew_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "cooldown_enabled": False,
            "cooldown_minutes": 0,
            "grace_seconds": 60,
            "five_min_finish_minutes": 5,
            "warn_thresholds_minutes": [5, 1],
            # Per-limit active windows: inside the window the limit applies; outside it relaxes (free play).
            # start==end means an empty window -> never active -> that limit is always relaxed.
            "opens_window_enabled": False,
            "opens_window_start": "00:00",
            "opens_window_end": "00:00",
            "time_window_enabled": False,
            "time_window_start": "00:00",
            "time_window_end": "00:00"
        },
        "per_game": {}
    },
    # Focus enforcement tiers (sub-project C)
    "focus_default_tier": "soft",  # "soft" | "medium" | "hard"
    "focus_take_a_break_max_per_session": 1,
    # Parental controls (sub-project D) — stub, NOT real auth
    "parental_controls": {
        "enabled": False,
        "passcode": "",  # plaintext STUB — NOT real auth; revisit before any release
        "mode": "self",  # "self" (locked) | "admin" (unlocked)
        "locked_features": ["game_limits", "focus_tier", "take_a_break", "mindfulness"]
    },
    # Mindfulness pause (universal friction before distractions / limit bypasses)
    "mindfulness": {
        "enabled": False,
        "text": "Is there something more productive I could be doing?",
        "cooldown": 5,  # seconds the Continue button stays disabled
        "triggers": {
            "game_launch": {"enabled": True},
            "parental_unlock": {"enabled": True},
            "focus_stop": {"enabled": True},
            "focus_skip": {"enabled": True},
            "settings_enter": {"enabled": True}
        }
    },
    # Game Limits streak (v1: local to game-limits; unify with Focus later)
    "game_limits_current_streak": 0,
    "game_limits_longest_streak": 0,
    "game_limits_last_streak_date": ""
}

class Plugin:
    focus_task = None
    game_limits_task = None
    suspend_monitor_task = None
    _game_running: bool = False  # Track game state from frontend
    loop = None
    
    # Missed Items State
    missed_items: list = []
    last_tick: float = 0

    # Sleep Inhibitor State
    _sleep_inhibitor_active: bool = False
    _uinput_fd = -1
    _jiggler_task = None

    # ==================== MISSED ITEMS METHODS ====================

    async def get_missed_items(self) -> list:
        """Get list of missed items."""
        return await self.settings_getSetting("missed_alerts_items", [])

    async def clear_missed_items(self) -> bool:
        """Clear all missed items."""
        await self.settings_setSetting("missed_alerts_items", [])
        await self.settings_commit()
        await self._emit_missed_update()
        return True

    async def _emit_missed_update(self):
        """Emit the current missed items to the frontend."""
        missed = await self.get_missed_items()
        await decky.emit("timeout_missed_items_updated", missed)

    async def _add_missed_item(self, m_type: str, m_id: str, label: str, timestamp: float, details: str = None):
        """Add an item to the missed alerts list."""
        user_settings = await self._get_user_settings()
        if not user_settings.get("missed_alerts_enabled", True):
            return

        missed = await self.settings_getSetting("missed_alerts_items", [])
        
        # Check for duplicates (same ID within small window)
        for item in missed:
            if item["id"] == m_id and abs(item["missed_at"] - timestamp) < 60:
                return

        item = {
            "id": m_id,
            "type": m_type,
            "label": label,
            "due_time": timestamp,
            "missed_at": timestamp
        }
        if details:
            item["details"] = details
            
        missed.append(item)
        
        # Prune old items
        window = float(user_settings.get("missed_alerts_window", 24)) * 3600
        cutoff = time.time() - window
        missed = [i for i in missed if i["missed_at"] > cutoff]
        
        await self.settings_setSetting("missed_alerts_items", missed)
        await self.settings_commit()
        
        # Notify frontend
        await self._emit_missed_update()

    # ==================== SLEEP INHIBITOR METHODS ====================

    async def _update_sleep_inhibitor(self):
        """Update the sleep inhibitor based on per-item prevent_sleep flags."""
        should_inhibit = False
        reason_parts = []
        inhibiting_items = []


        # Focus flagged prevent_sleep
        user_settings = await self._get_user_settings()
        focus = await self._get_focus_state()
        if focus.get("active", False) and user_settings.get("focus_prevent_sleep", False):
            should_inhibit = True
            reason_parts.append("Focus")
            inhibiting_items.append({"type": "focus", "id": "focus", "label": "Focus"})



        if should_inhibit:
            reason = "Timeout: " + ", ".join(reason_parts) + " active"
            await self._acquire_sleep_inhibitor(reason)
            await decky.emit("timeout_sleep_inhibitor_updated", {
                "active": True,
                "reason": reason,
                "items": inhibiting_items
            })
        else:
            await self._release_sleep_inhibitor()
            # _release_sleep_inhibitor emits the inactive event

    async def _jiggler_loop(self):
        """Simulate activity periodically to prevent sleep using uinput keyboard events."""
        decky.logger.info("Timeout: Sleep inhibitor jiggler started")
        
        # KEY_UNKNOWN (240) - a key code that doesn't map to any real key
        # This resets idle timers without affecting games or triggering any action
        KEY_UNKNOWN = 240
        EV_KEY = 1
        EV_SYN = 0
        
        try:
            while self._sleep_inhibitor_active:
                # Use uinput keyboard device if available (most reliable for Game Mode)
                if self._uinput_fd > 0:
                    try:
                        now = time.time()
                        sec = int(now)
                        usec = int((now - sec) * 1000000)
                        
                        # struct input_event: 'llHHi' = timeval(16) + type(2) + code(2) + value(4) = 24 bytes
                        # Send KEY_UNKNOWN press (value=1) then release (value=0)
                        key_press = struct.pack('llHHi', sec, usec, EV_KEY, KEY_UNKNOWN, 1)
                        os.write(self._uinput_fd, key_press)
                        
                        # SYN_REPORT
                        syn = struct.pack('llHHi', sec, usec, EV_SYN, 0, 0)
                        os.write(self._uinput_fd, syn)
                        
                        # Key release
                        key_release = struct.pack('llHHi', sec, usec, EV_KEY, KEY_UNKNOWN, 0)
                        os.write(self._uinput_fd, key_release)
                        os.write(self._uinput_fd, syn)
                        
                        decky.logger.debug("Timeout: uinput key event sent")
                    except Exception as e:
                        decky.logger.warning(f"Timeout: uinput write error: {e}")
                    
                # Wait 30 seconds (well under typical sleep timeouts)
                await asyncio.sleep(30)
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            decky.logger.error(f"Timeout: Jiggler loop error: {e}")
            self._sleep_inhibitor_active = False

    async def _acquire_sleep_inhibitor(self, reason: str):
        """Acquire the sleep inhibitor using uinput virtual keyboard."""
        if self._sleep_inhibitor_active:
            return  # Already active
        
        try:
            # Create uinput virtual keyboard device for Game Mode sleep prevention
            # Using keyboard KEY_UNKNOWN to avoid interfering with gamepad input
            try:
                # ioctl constants for uinput
                UI_SET_EVBIT = 0x40045564
                UI_SET_KEYBIT = 0x40045565
                UI_DEV_CREATE = 0x5501
                
                fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
                
                # Enable EV_KEY (keyboard events) and KEY_UNKNOWN (240)
                fcntl.ioctl(fd, UI_SET_EVBIT, 1)  # EV_KEY
                fcntl.ioctl(fd, UI_SET_KEYBIT, 240)  # KEY_UNKNOWN - doesn't map to any real key
                
                # Build uinput_user_dev struct (size 1116 on Steam Deck)
                name = b'Timeout Sleep Inhibitor'.ljust(80, b'\x00')
                input_id = struct.pack('HHHH', 3, 1, 1, 1)  # bustype, vendor, product, version
                total_size = 1116  # Confirmed working size on Steam Deck
                payload = name + input_id + (b'\x00' * (total_size - len(name) - len(input_id)))
                
                os.write(fd, payload)
                fcntl.ioctl(fd, UI_DEV_CREATE)
                
                self._uinput_fd = fd
                decky.logger.info("Timeout: Created uinput keyboard device successfully")
            except Exception as e:
                decky.logger.error(f"Timeout: Failed to setup uinput: {e}")
                self._uinput_fd = -1
                return  # Cannot proceed without uinput
            
            # Start jiggler task
            if self.loop and self._uinput_fd > 0:
                self._sleep_inhibitor_active = True
                self._jiggler_task = self.loop.create_task(self._jiggler_loop())
                decky.logger.info(f"Timeout: Sleep inhibitor active - {reason}")
                await decky.emit("timeout_sleep_inhibitor_updated", {
                    "active": True,
                    "reason": reason
                })
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to acquire sleep inhibitor: {e}")

    async def _release_sleep_inhibitor(self):
        """Release the sleep inhibitor."""
        if not self._sleep_inhibitor_active:
            return  # Not active
        
        try:
            # Release jiggler task
            if self._jiggler_task:
                self._jiggler_task.cancel()
                self._jiggler_task = None
            
            # Destroy and close uinput device
            if self._uinput_fd > 0:
                try:
                    UI_DEV_DESTROY = 0x5502
                    fcntl.ioctl(self._uinput_fd, UI_DEV_DESTROY)
                    os.close(self._uinput_fd)
                    decky.logger.info("Timeout: uinput device destroyed")
                except Exception as e:
                    decky.logger.warning(f"Timeout: Error closing uinput: {e}")
                self._uinput_fd = -1
                
            self._sleep_inhibitor_active = False
            decky.logger.info("Timeout: Sleep inhibitor released")
            await decky.emit("timeout_sleep_inhibitor_updated", {
                "active": False,
                "reason": "",
                "items": []
            })
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to release sleep inhibitor: {e}")
            # Force cleanup
            if self._uinput_fd > 0:
                try:
                    os.close(self._uinput_fd)
                except:
                    pass
                self._uinput_fd = -1
            self._jiggler_task = None
            self._sleep_inhibitor_active = False

    async def get_sleep_inhibitor_status(self) -> dict:
        """Items currently flagged to prevent sleep."""
        inhibiting_items = []


        user_settings = await self._get_user_settings()
        focus = await self._get_focus_state()
        if (focus.get("active", False) and
                user_settings.get("focus_prevent_sleep", False)):
            inhibiting_items.append({"type": "focus", "id": "focus", "label": "Focus"})


        return {
            "active": self._sleep_inhibitor_active,
            "items": inhibiting_items
        }

    async def disable_all_sleep_inhibitors(self) -> bool:
        """Disable all mechanisms preventing sleep."""
        decky.logger.info("Timeout: Disabling all sleep inhibitors")


        # Stop focus if active
        focus = await self._get_focus_state()
        if focus.get("active", False):
            await self.stop_focus_session()


        await self._update_sleep_inhibitor()

        return True










    async def get_sounds(self) -> list:
        """Get list of available sound files from dist and custom_sounds folders."""
        sounds = [
            {"filename": "soundless", "name": "🔇 Soundless"}
        ]
        try:
            plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", "")
            if not plugin_dir:
                plugin_dir = os.path.dirname(settingsDir)
            
            # Built-in sounds from dist/
            dist_dir = os.path.join(plugin_dir, "dist")
            if os.path.exists(dist_dir):
                for filename in os.listdir(dist_dir):
                    if filename.lower().endswith(('.mp3', '.wav', '.ogg')):
                        sounds.append({
                            "filename": filename,
                            "name": os.path.splitext(filename)[0].replace('_', ' ').title()
                        })
            
            # Custom sounds from settingsDir/custom_sounds/
            custom_dir = os.path.join(settingsDir, "custom_sounds")
            if os.path.exists(custom_dir):
                for filename in os.listdir(custom_dir):
                    if filename.lower().endswith(('.mp3', '.wav', '.ogg')):
                        sounds.append({
                            "filename": f"custom:{filename}",
                            "name": f"★ {os.path.splitext(filename)[0].replace('_', ' ').title()}"
                        })
            
            decky.logger.info(f"Timeout: Found {len(sounds)} sound options")
        except Exception as e:
            decky.logger.error(f"Timeout: Error listing sounds: {e}")
            sounds = [
                {"filename": "soundless", "name": "🔇 Soundless"},
                {"filename": "alarm.mp3", "name": "Alarm"}
            ]
        
        return sounds

    async def import_custom_sounds(self) -> dict:
        """Sync custom sounds from ~/Music/Timeout_Sounds.
        
        This acts as a sync: copies new/updated files and removes
        sounds that no longer exist in the source folder.
        """
        import shutil
        
        result = {
            "success": False,
            "imported": 0,
            "removed": 0,
            "errors": [],
            "message": ""
        }
        
        try:
            # Source directory: ~/Music/Timeout_Sounds
            home_dir = os.path.expanduser("~")
            source_dir = os.path.join(home_dir, "Music", "Timeout_Sounds")
            
            if not os.path.exists(source_dir):
                result["message"] = f"Folder not found: {source_dir}"
                return result
                
            # Destination directory: settingsDir/custom_sounds (writable)
            custom_dir = os.path.join(settingsDir, "custom_sounds")
            os.makedirs(custom_dir, exist_ok=True)
            
            # Scan and copy files
            valid_extensions = ('.mp3', '.wav', '.ogg')
            max_size = 2 * 1024 * 1024  # 2MB
            
            # Get set of source files (lowercase for case-insensitive comparison)
            source_files = set()
            for filename in os.listdir(source_dir):
                if filename.lower().endswith(valid_extensions):
                    source_files.add(filename)
            
            # Copy new/updated files from source
            count = 0
            for filename in source_files:
                src_path = os.path.join(source_dir, filename)
                
                # Check size
                try:
                    size = os.path.getsize(src_path)
                    if size > max_size:
                        result["errors"].append(f"{filename} too large (>2MB)")
                        continue
                        
                    # Copy file
                    dst_path = os.path.join(custom_dir, filename)
                    shutil.copy2(src_path, dst_path)
                    count += 1
                    decky.logger.info(f"Timeout: Imported sound {filename}")
                    
                except Exception as e:
                    result["errors"].append(f"Error copying {filename}: {str(e)}")
            
            # Remove files that no longer exist in source (sync behavior)
            removed_count = 0
            if os.path.exists(custom_dir):
                for filename in os.listdir(custom_dir):
                    if filename.lower().endswith(valid_extensions):
                        if filename not in source_files:
                            try:
                                dst_path = os.path.join(custom_dir, filename)
                                os.remove(dst_path)
                                removed_count += 1
                                decky.logger.info(f"Timeout: Removed sound {filename} (no longer in source)")
                            except Exception as e:
                                result["errors"].append(f"Error removing {filename}: {str(e)}")
            
            result["success"] = True
            result["imported"] = count
            result["removed"] = removed_count
            
            # Build message
            messages = []
            if count > 0:
                messages.append(f"Imported {count} sound(s)")
            if removed_count > 0:
                messages.append(f"Removed {removed_count} sound(s)")
            if not messages:
                messages.append("No changes - sounds are in sync")
            result["message"] = ". ".join(messages) + "."
                 
        except Exception as e:
            decky.logger.error(f"Timeout: Import sounds failed: {e}")
            result["message"] = f"Sync failed: {str(e)}"
            
        return result

    async def get_sound_data(self, filename: str) -> dict:
        """Get base64-encoded sound data for a custom sound file.
        
        This allows the frontend to play custom sounds via HTML5 Audio,
        which routes correctly through Steam's audio system.
        
        Args:
            filename: Sound filename with 'custom:' prefix
            
        Returns:
            Dict with 'success', 'data' (base64), 'mime_type'
        """
        import base64
        import mimetypes
        
        result = {"success": False, "data": None, "mime_type": None}
        
        if not filename or not filename.startswith("custom:"):
            result["error"] = "Only custom sounds supported"
            return result
            
        actual_name = filename[7:]  # Remove "custom:" prefix
        file_path = os.path.join(settingsDir, "custom_sounds", actual_name)
        
        if not os.path.exists(file_path):
            result["error"] = f"File not found: {file_path}"
            decky.logger.error(f"Timeout: Sound file not found: {file_path}")
            return result
            
        try:
            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                ext = os.path.splitext(file_path)[1].lower()
                mime_type = {
                    '.mp3': 'audio/mpeg',
                    '.wav': 'audio/wav',
                    '.ogg': 'audio/ogg'
                }.get(ext, 'audio/mpeg')
            
            # Read and encode file
            with open(file_path, 'rb') as f:
                audio_data = f.read()
            
            result["success"] = True
            result["data"] = base64.b64encode(audio_data).decode('utf-8')
            result["mime_type"] = mime_type
            decky.logger.info(f"Timeout: Loaded sound data for {filename} ({len(audio_data)} bytes)")
            
        except Exception as e:
            result["error"] = str(e)
            decky.logger.error(f"Timeout: Failed to load sound data: {e}")
            
        return result

    async def play_sound(self, filename: str, volume: int = 100, loop: bool = False) -> bool:
        """Play a sound file via paplay (Linux/SteamOS).
        
        Args:
            filename: Sound filename. Can be 'custom:file.mp3' for custom sounds or just 'file.mp3' for built-in.
            volume: Volume 0-100
        """
        import subprocess
        
        if not filename or filename == "soundless":
            return True
            
        # Resolve file path
        file_path = None
        if filename.startswith("custom:"):
            # Custom sound in settingsDir/custom_sounds
            actual_name = filename[7:]  # Remove "custom:" prefix
            file_path = os.path.join(settingsDir, "custom_sounds", actual_name)
        else:
            # Built-in sound in dist/
            plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", "")
            if not plugin_dir:
                plugin_dir = os.path.dirname(settingsDir)
            file_path = os.path.join(plugin_dir, "dist", filename)
        
        if not os.path.exists(file_path):
            decky.logger.error(f"Timeout: Sound file not found: {file_path}")
            return False
            
        try:
            # Convert volume 0-100 to paplay's 0-65536
            vol = int((min(100, max(0, volume)) / 100) * 65536)
            
            # Stop any currently playing sound first
            if hasattr(self, '_current_sound_process') and self._current_sound_process:
                try:
                    self._current_sound_process.terminate()
                except:
                    pass
            
            decky.logger.info(f"Timeout: Attempting to play: {file_path} at volume {vol}")
            
            # Play using paplay (non-blocking)
            self._current_sound_process = subprocess.Popen(
                ["paplay", "--volume", str(vol), file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            decky.logger.info(f"Timeout: Started paplay PID {self._current_sound_process.pid}")
            return True
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to play sound: {e}")
            return False

    async def stop_sound(self) -> bool:
        """Stop currently playing sound."""
        import subprocess
        try:
            if hasattr(self, '_current_sound_process') and self._current_sound_process:
                self._current_sound_process.terminate()
                self._current_sound_process = None
                decky.logger.info("Timeout: Stopped sound")
            return True
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to stop sound: {e}")
            return False

    async def debug_sound(self, filename: str) -> dict:
        """Debug sound file path resolution."""
        result = {
            "filename": filename,
            "is_custom": filename.startswith("custom:"),
            "resolved_path": None,
            "file_exists": False,
            "settings_dir": settingsDir,
            "custom_sounds_dir": os.path.join(settingsDir, "custom_sounds"),
            "custom_sounds_files": []
        }
        
        # List files in custom_sounds dir
        custom_dir = os.path.join(settingsDir, "custom_sounds")
        if os.path.exists(custom_dir):
            result["custom_sounds_files"] = os.listdir(custom_dir)
        
        # Resolve path
        if filename.startswith("custom:"):
            actual_name = filename[7:]
            result["resolved_path"] = os.path.join(settingsDir, "custom_sounds", actual_name)
        else:
            plugin_dir = os.environ.get("DECKY_PLUGIN_DIR", "")
            if not plugin_dir:
                plugin_dir = os.path.dirname(settingsDir)
            result["resolved_path"] = os.path.join(plugin_dir, "dist", filename)
        
        result["file_exists"] = os.path.exists(result["resolved_path"]) if result["resolved_path"] else False
        
        decky.logger.info(f"Timeout Debug: {result}")
        return result

    # ==================== FOCUS METHODS ====================

    async def start_focus_session(self, tier: str = None) -> dict:
        """Start a new Focus session. tier overrides focus_default_tier (soft|medium|hard)."""
        user_settings = await self._get_user_settings()
        work_duration = user_settings.get("focus_work_duration", 25) * 60
        
        focus_state = await self._get_focus_state()
        session = focus_state.get("current_session", 0) + 1
        tier_val = tier if tier in ("soft", "medium", "hard") else user_settings.get("focus_default_tier", "soft")
        
        state = {
            "active": True,
            "is_break": False,
            "current_session": session,
            "current_cycle": 1,
            "tier": tier_val,
            "start_time": time.time(),
            "end_time": time.time() + work_duration,
            "duration": work_duration
        }
        
        await self._save_focus_state(state)
        
        # Cancel existing task if any
        if self.focus_task:
            self.focus_task.cancel()
        
        self.focus_task = self.loop.create_task(self._focus_handler())
        
        decky.logger.info(f"Timeout: Started Focus session {session}")
        
        # Inject stats for frontend update
        state["stats"] = await self._get_focus_stats()
        
        await decky.emit("timeout_focus_started", state)
        # Update sleep inhibitor
        await self._update_sleep_inhibitor()
        return state

    async def stop_focus_session(self) -> bool:
        """Stop the current Focus session."""
        if self.focus_task:
            self.focus_task.cancel()
            self.focus_task = None
            
        # Update stats for partial session
        try:
            current_state = await self._get_focus_state()
            if current_state.get("active") and current_state.get("start_time"):
                elapsed = time.time() - current_state.get("start_time")
                is_break = current_state.get("is_break", False)
                await self._update_focus_stats(
                    is_break=is_break,
                    duration=elapsed,
                    completed_session=not is_break,
                    completed_cycle=is_break and current_state.get("break_type") == "long"
                )
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to update stats on stop: {e}")

        state = {
            "active": False,
            "is_break": False,
            "current_session": 0,
            "current_cycle": 0,
            "end_time": None,
            "duration": 0
        }
        await self._save_focus_state(state)
        
        decky.logger.info("Timeout: Stopped Focus")
        
        # Inject stats
        state["stats"] = await self._get_focus_stats()
        
        await decky.emit("timeout_focus_stopped", state)
        # Update sleep inhibitor
        await self._update_sleep_inhibitor()
        return True

    async def set_focus_tier(self, tier: str) -> dict:
        """Change the enforcement tier of the active session (on-demand focus)."""
        if await self._parental_locked("focus_tier"):
            return {"error": "parental_locked"}
        if tier not in ("soft", "medium", "hard"):
            return {"error": "invalid_tier"}
        state = await self._get_focus_state()
        if not state.get("active"):
            return {"error": "not_active"}
        state["tier"] = tier
        await self._save_focus_state(state)
        state["stats"] = await self._get_focus_stats()
        await decky.emit("timeout_focus_phase_changed", state)
        return state

    async def skip_focus_phase(self) -> dict:
        """Skip the current work/break phase."""
        focus_state = await self._get_focus_state()
        
        if not focus_state.get("active"):
            return focus_state
            
        # Update stats for skipped phase
        try:
            if focus_state.get("start_time"):
                elapsed = time.time() - focus_state.get("start_time")
                is_break = focus_state.get("is_break", False)
                await self._update_focus_stats(
                    is_break=is_break,
                    duration=elapsed,
                    completed_session=not is_break,
                    completed_cycle=is_break and focus_state.get("break_type") == "long"
                )
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to update stats on skip: {e}")
        
        user_settings = await self._get_user_settings()
        is_break = focus_state.get("is_break", False)
        session = focus_state.get("current_session", 1)
        
        cycle = focus_state.get("current_cycle", 1)
        
        if is_break:
            # Starting new work session from break
            # Check if a long break just finished
            was_long_break = focus_state.get("break_type") == "long"
            
            if was_long_break:
                new_session = 1
                new_cycle = cycle + 1
            else:
                new_session = session + 1
                new_cycle = cycle

            work_duration = user_settings.get("focus_work_duration", 25) * 60
            work_duration = user_settings.get("focus_work_duration", 25) * 60
            state = {
                "active": True,
                "is_break": False,
                "current_session": new_session,
                "current_cycle": new_cycle,
                "tier": focus_state.get("tier", "soft"),
                "start_time": time.time(),
                "end_time": time.time() + work_duration,
                "duration": work_duration
            }
        else:
            # Starting break
            sessions_until_long = user_settings.get("focus_sessions_until_long_break", 4)
            if session % sessions_until_long == 0:
                break_duration = user_settings.get("focus_long_break_duration", 15) * 60
                break_type = "long"
            else:
                break_duration = user_settings.get("focus_break_duration", 5) * 60
                break_type = "short"
            
            state = {
                "active": True,
                "is_break": True,
                "current_session": session,
                "current_cycle": cycle,
                "tier": focus_state.get("tier", "soft"),
                "start_time": time.time(),
                "end_time": time.time() + break_duration,
                "duration": break_duration,
                "break_type": break_type
            }
        
        await self._save_focus_state(state)
        
        # Restart handler
        if self.focus_task:
            self.focus_task.cancel()
        self.focus_task = self.loop.create_task(self._focus_handler())
        
        # Inject stats for frontend
        state["stats"] = await self._get_focus_stats()
        
        await decky.emit("timeout_focus_phase_changed", state)
        return state

    async def start_adhoc_break(self, duration_min: int) -> dict:
        """Take-a-break: end the current work phase and start a custom-duration
        short break. Friction-capped (focus_take_a_break_max_per_session).
        Does NOT break the streak."""
        if await self._parental_locked("take_a_break"):
            return {"error": "parental_locked"}
        focus = await self._get_focus_state()
        if not focus.get("active"):
            return {"error": "not_active"}
        us = await self._get_user_settings()
        max_per_session = us.get("focus_take_a_break_max_per_session", 1)
        used = focus.get("adhoc_breaks_used", 0)
        if used >= max_per_session:
            return {"error": "max_reached"}
        # credit partial work-phase time before switching
        try:
            if focus.get("start_time") and not focus.get("is_break"):
                elapsed = time.time() - focus.get("start_time")
                await self._update_focus_stats(is_break=False, duration=elapsed,
                                               completed_session=False, completed_cycle=False)
        except Exception as e:
            decky.logger.error(f"Timeout: adhoc break stats error: {e}")
        break_dur = max(1, int(duration_min)) * 60
        state = {
            "active": True,
            "is_break": True,
            "current_session": focus.get("current_session", 1),
            "current_cycle": focus.get("current_cycle", 1),
            "tier": focus.get("tier", "soft"),
            "start_time": time.time(),
            "end_time": time.time() + break_dur,
            "duration": break_dur,
            "break_type": "short",
            "adhoc_breaks_used": used + 1,
        }
        await self._save_focus_state(state)
        if self.focus_task:
            self.focus_task.cancel()
        self.focus_task = self.loop.create_task(self._focus_handler())
        state["stats"] = await self._get_focus_stats()
        await decky.emit("timeout_focus_phase_changed", state)
        return state

    async def _get_focus_stats(self) -> dict:
        """Get stats from user settings, handling daily buffer reset and streak tracking."""
        settings = await self._get_user_settings()
        # Default structure with new fields
        defaults = {
            "daily_focus_time": 0,
            "daily_break_time": 0,
            "daily_sessions": 0,
            "daily_cycles": 0,
            "total_focus_time": 0,
            "total_break_time": 0,
            "total_sessions": 0,
            "total_cycles": 0,
            "last_active_date": "",
            "daily_history": [],  # List of {date, focus_time, sessions}
            "current_streak": 0,
            "longest_streak": 0
        }
        
        stats = settings.get("focus_stats", {})
        # Merge defaults for missing keys
        for k, v in defaults.items():
            if k not in stats:
                stats[k] = v
        
        # Check daily reset
        today = datetime.now().strftime("%Y-%m-%d")
        if stats.get("last_active_date") != today:
            # Archive previous day's data if there was activity
            last_date = stats.get("last_active_date", "")
            if last_date and (stats.get("daily_focus_time", 0) > 0 or stats.get("daily_sessions", 0) > 0):
                # Add to history
                history_entry = {
                    "date": last_date,
                    "focus_time": stats.get("daily_focus_time", 0),
                    "sessions": stats.get("daily_sessions", 0)
                }
                history = stats.get("daily_history", [])
                history.append(history_entry)
                # Keep only last 30 days
                if len(history) > 30:
                    history = history[-30:]
                stats["daily_history"] = history
            
            # Check streak: was there activity YESTERDAY specifically?
            yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            
            # Only keep streak if last activity was yesterday AND there was actual focus time
            if last_date == yesterday and stats.get("daily_focus_time", 0) > 0:
                pass
            else:
                stats["current_streak"] = 0
            
            # Reset daily counters for the new day
            stats["daily_focus_time"] = 0
            stats["daily_break_time"] = 0
            stats["daily_sessions"] = 0
            stats["daily_cycles"] = 0
            stats["last_active_date"] = today
            
            # Save reset stats immediately to prevent zeroed stats on next read
            settings["focus_stats"] = stats
            await self.settings_setSetting(SETTINGS_KEY_SETTINGS, settings)
            await self.settings_commit()
            
        return stats

    async def _update_focus_stats(self, is_break: bool, duration: float, completed_session: bool = False, completed_cycle: bool = False):
        """Update persistent stats."""
        settings = await self._get_user_settings()
        # Get fresh stats via helper which handles reset logic
        stats = await self._get_focus_stats()
        
        # Add duration (ensure positive)
        duration = max(0, duration)
        
        if is_break:
            stats["daily_break_time"] += duration
            stats["total_break_time"] += duration
        else:
            old_focus = stats.get("daily_focus_time", 0)
            stats["daily_focus_time"] += duration
            stats["total_focus_time"] += duration
            
            # Increment streak on the first focus time of the day
            if old_focus == 0 and duration > 0:
                stats["current_streak"] = stats.get("current_streak", 0) + 1
                if stats["current_streak"] > stats.get("longest_streak", 0):
                    stats["longest_streak"] = stats["current_streak"]
            
        if completed_session and not is_break:
            stats["total_sessions"] = stats.get("total_sessions", 0) + 1
            old_daily = stats.get("daily_sessions", 0)
            stats["daily_sessions"] = old_daily + 1
            
        if completed_cycle:
            stats["total_cycles"] = stats.get("total_cycles", 0) + 1
            
        # Save back to settings
        settings["focus_stats"] = stats
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, settings)
        await self.settings_commit()

    async def reset_focus_stats(self) -> bool:
        """Reset all Focus statistics."""
        defaults = {
            "daily_focus_time": 0,
            "daily_break_time": 0,
            "daily_sessions": 0,
            "daily_cycles": 0,
            "total_focus_time": 0,
            "total_break_time": 0,
            "total_sessions": 0,
            "total_cycles": 0,
            "last_active_date": "",
            "daily_history": [],
            "current_streak": 0,
            "longest_streak": 0
        }
        
        settings = await self._get_user_settings()
        settings["focus_stats"] = defaults
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, settings)
        await self.settings_commit()
        return True

    async def get_focus_state(self) -> dict:
        """Get current Focus state with remaining time."""
        state = await self._get_focus_state()
        if state.get("active") and state.get("end_time"):
            state["remaining"] = max(0, state["end_time"] - time.time())
        else:
            state["remaining"] = 0
            
        state["stats"] = await self._get_focus_stats()
        return state

    async def _focus_handler(self):
        """Background task to handle Focus timing."""
        try:
            while True:
                now = time.time()
                # Sync with suspend monitor to avoid double-processing during resume
                if self.last_tick > 0 and now - self.last_tick > 5:
                    await asyncio.sleep(0.5)
                    continue

                state = await self._get_focus_state()
                
                if not state.get("active"):
                    return
                
                remaining = state.get("end_time", 0) - time.time()
                
                if remaining <= 0:
                    # Phase completed
                    user_settings = await self._get_user_settings()
                    is_break = state.get("is_break", False)
                    session = state.get("current_session", 1)
                    cycle = state.get("current_cycle", 1)
                    
                    # Check if missed by > 60 seconds
                    if remaining < -60:
                        decky.logger.info(f"Timeout: Focus phase missed by {abs(remaining):.0f}s")
                        missed_label = f"Focus: {'Break' if is_break else 'Focus Session'} {session}"
                        # Use scheduled end time as due time
                        due_time = state.get("end_time", time.time())
                        await self._add_missed_item("focus", "focus", missed_label, due_time)
                        
                        # Stop the cycle (do not auto-advance)
                        # Credit the session duration (capped) because it "finished"
                        elapsed = state.get("duration", 0) # Use intended duration
                        try:
                            await self._update_focus_stats(
                                is_break=is_break,
                                duration=elapsed,
                                completed_session=not is_break,
                                completed_cycle=is_break and state.get("break_type") == "long"
                            )
                        except Exception as e:
                            decky.logger.error(f"Timeout: Stats update error: {e}")

                        # Reset state to inactive
                        new_state = await self._get_focus_state()
                        new_state["active"] = False
                        new_state["remaining"] = 0
                        await self._save_focus_state(new_state)
                        await decky.emit("timeout_focus_updated", new_state)
                        # Update sleep inhibitor
                        await self._update_sleep_inhibitor()
                        return # Exit loop

                    # Update stats for completed phase
                    try:
                        if state.get("start_time"):
                            elapsed = time.time() - state.get("start_time")
                            await self._update_focus_stats(
                                is_break=is_break,
                                duration=elapsed,
                                completed_session=not is_break,
                                completed_cycle=is_break and state.get("break_type") == "long"
                            )
                    except Exception as e:
                        decky.logger.error(f"Timeout: Failed to update stats on completion: {e}")
                    
                    if is_break:
                        # Break finished, start new work session
                        work_duration = user_settings.get("focus_work_duration", 25) * 60
                        focus_sound = user_settings.get("focus_sound", "alarm.mp3")
                        is_subtle = user_settings.get("focus_subtle_mode", False)
                        
                        # Check if a long break just finished
                        was_long_break = state.get("break_type") == "long"
                        if was_long_break:
                            new_session = 1
                            new_cycle = cycle + 1
                        else:
                            new_session = session + 1
                            new_cycle = cycle
                            
                        new_state = {
                            "active": True,
                            "is_break": False,
                            "current_session": new_session,
                            "current_cycle": new_cycle,
                            "tier": state.get("tier", "soft"),
                            "start_time": time.time(),
                            "end_time": time.time() + work_duration,
                            "duration": work_duration,
                            "sound": focus_sound,
                            "subtle_mode": is_subtle,
                            "stats": await self._get_focus_stats()
                        }
                        await decky.emit("timeout_focus_break_ended", new_state)
                    else:
                        # Work finished, start break
                        sessions_until_long = user_settings.get("focus_sessions_until_long_break", 4)
                        if session % sessions_until_long == 0:
                            break_duration = user_settings.get("focus_long_break_duration", 15) * 60
                            break_type = "long"
                        else:
                            break_duration = user_settings.get("focus_break_duration", 5) * 60
                            break_type = "short"
                        
                        new_state = {
                            "active": True,
                            "is_break": True,
                            "current_session": session,
                            "current_cycle": cycle,
                            "tier": state.get("tier", "soft"),
                            "start_time": time.time(),
                            "end_time": time.time() + break_duration,
                            "duration": break_duration,
                            "break_type": break_type,
                            "sound": user_settings.get("focus_sound", "alarm.mp3"),
                            "subtle_mode": user_settings.get("focus_subtle_mode", False),
                            "stats": await self._get_focus_stats()
                        }
                        await decky.emit("timeout_focus_work_ended", new_state)
                    
                    await self._save_focus_state(new_state)
                    decky.logger.info(f"Timeout: Focus phase changed - is_break={new_state['is_break']}")
                
                # Emit tick every 5 seconds
                await decky.emit("timeout_focus_tick", {
                    "remaining": int(max(0, remaining)),
                    "is_break": state.get("is_break", False),
                    "session": state.get("current_session", 1),
                    "cycle": state.get("current_cycle", 1)
                })
                
                await asyncio.sleep(1)  # Update every second for real-time display
                
        except asyncio.CancelledError:
            decky.logger.info("Timeout: Focus handler stopped")

    async def _get_focus_state(self) -> dict:
        return await self.settings_getSetting(SETTINGS_KEY_FOCUS, {
            "active": False,
            "is_break": False,
            "current_session": 0,
            "current_cycle": 0,
            "end_time": None,
            "duration": 0
        })

    async def _save_focus_state(self, state: dict):
        await self.settings_setSetting(SETTINGS_KEY_FOCUS, state)
        await self.settings_commit()

    # ==================== GAME LIMITS METHODS (sub-project B) ====================

    async def _get_game_limits_state(self) -> dict:
        return await self.settings_getSetting(SETTINGS_KEY_GAME_LIMITS, {})

    async def _save_game_limits_state(self, state: dict):
        await self.settings_setSetting(SETTINGS_KEY_GAME_LIMITS, state)
        await self.settings_commit()

    async def _get_game_limits_config(self) -> dict:
        us = await self._get_user_settings()
        cfg = us.get("game_limits_config", DEFAULT_SETTINGS["game_limits_config"])
        cfg = json.loads(json.dumps(cfg))  # deep copy
        cfg["global"] = {**DEFAULT_SETTINGS["game_limits_config"]["global"], **cfg.get("global", {})}
        cfg.setdefault("per_game", {})
        return cfg

    async def get_game_limits_config(self) -> dict:
        return await self._get_game_limits_config()

    async def update_game_limits_config(self, partial: dict) -> dict:
        if await self._parental_locked("game_limits"):
            return {"error": "parental_locked"}
        us = await self._get_user_settings()
        cfg = us.get("game_limits_config", DEFAULT_SETTINGS["game_limits_config"])
        cfg = json.loads(json.dumps(cfg))
        # streak-asymmetry: disabling opens breaks the streak immediately
        if "global" in partial:
            prev = cfg.get("global", {})
            if partial["global"].get("opens_enabled") is False and prev.get("opens_enabled") is True:
                await self._break_game_limits_streak()
        if "enabled" in partial:
            cfg["enabled"] = bool(partial["enabled"])
        if "mode" in partial:
            cfg["mode"] = partial["mode"]
        if "global" in partial:
            cfg["global"] = {**cfg.get("global", {}), **partial["global"]}
        if "per_game" in partial:
            cfg["per_game"] = partial["per_game"]
        us["game_limits_config"] = cfg
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_settings_updated", us)
        return cfg

    async def get_game_limits_state(self) -> dict:
        return await self._get_game_limits_state()

    def _effective_rule(self, cfg: dict, appid: str) -> dict:
        base = dict(cfg["global"])
        override = cfg.get("per_game", {}).get(appid, {})
        base.update({k: v for k, v in override.items() if v is not None})
        return base

    def _is_limited(self, appid: str, cfg: dict) -> bool:
        mode = cfg.get("mode", "blacklist")
        per_game = cfg.get("per_game", {})
        if mode == "whitelist":
            return appid in per_game
        return appid not in per_game  # blacklist: listed apps are exempt

    @staticmethod
    def _parse_hhmm(s: str) -> int:
        try:
            h, m = str(s).split(":")
            return int(h) * 60 + int(m)
        except Exception:
            return 0

    def _now_in_window(self, start_hhmm: str, end_hhmm: str) -> bool:
        """True if current local time is inside [start, end). start==end is an empty
        window -> never active. Wraps midnight (e.g. 22:00-06:00)."""
        start = self._parse_hhmm(start_hhmm)
        end = self._parse_hhmm(end_hhmm)
        now_min = datetime.now().hour * 60 + datetime.now().minute
        if start == end:
            return False
        if start < end:
            return start <= now_min < end
        return now_min >= start or now_min < end  # wraps midnight

    def _now_in_curfew(self, rule: dict) -> bool:
        days = rule.get("curfew_days", [])
        if days and datetime.now().strftime("%a") not in days:
            return False
        return self._now_in_window(rule.get("curfew_start", "00:00"), rule.get("curfew_end", "05:00"))

    def _new_state_entry(self, rule: dict) -> dict:
        credits = 2 * rule.get("opens_per_day", 3) if rule.get("opens_enabled") else 0
        return {
            "credits_remaining": credits,
            "time_consumed_today_sec": 0,
            "session_start": None,
            "session_cap_end": None,
            "is_half_open": False,
            "cooldown_until": None,
            "five_min_finish_used": False,
            "five_min_offered": False,
            "in_grace": False,
            "grace_until": None,
            "killed": False,
            "adherent_today": False,
            "last_reset_date": datetime.now().strftime("%Y-%m-%d"),
        }

    def _maybe_reset_daily(self, entry: dict, rule: dict) -> dict:
        today = datetime.now().strftime("%Y-%m-%d")
        if entry.get("last_reset_date") != today:
            entry["credits_remaining"] = 2 * rule.get("opens_per_day", 3) if rule.get("opens_enabled") else 0
            entry["time_consumed_today_sec"] = 0
            entry["five_min_finish_used"] = False
            entry["five_min_offered"] = False
            entry["adherent_today"] = False
            entry["killed"] = False
            entry["last_reset_date"] = today
        return entry

    async def _daily_rollover_check(self):
        """Lazily roll the game-limits streak once per day (called from tick + report)."""
        us = await self._get_user_settings()
        today = datetime.now().strftime("%Y-%m-%d")
        if us.get("game_limits_last_streak_date") == today:
            return
        state = await self._get_game_limits_state()
        any_adherent = any(e.get("adherent_today") for e in state.values())
        cur = us.get("game_limits_current_streak", 0)
        cur = cur + 1 if any_adherent else 0
        us["game_limits_current_streak"] = cur
        if cur > us.get("game_limits_longest_streak", 0):
            us["game_limits_longest_streak"] = cur
        us["game_limits_last_streak_date"] = today
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_game_streak", {"current": cur, "longest": us["game_limits_longest_streak"]})

    async def _break_game_limits_streak(self):
        us = await self._get_user_settings()
        us["game_limits_current_streak"] = 0
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_game_streak", {"current": 0, "longest": us.get("game_limits_longest_streak", 0)})

    async def reset_game_limits_streak(self) -> bool:
        us = await self._get_user_settings()
        us["game_limits_current_streak"] = 0
        us["game_limits_longest_streak"] = 0
        us["game_limits_last_streak_date"] = ""
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_game_streak", {"current": 0, "longest": 0})
        return True

    def _scan_reaper_pids(self, appid: str) -> list:
        """Find Steam reaper PIDs for appid by scanning /proc/*/cmdline.
        Pattern (Lutris-sourced): 'reaper SteamLaunch AppId=<appid>'."""
        prefix = f"SteamLaunch AppId={appid}"
        pids = []
        try:
            entries = os.listdir("/proc")
        except OSError:
            return pids
        for pid_str in entries:
            if not pid_str.isdigit():
                continue
            try:
                with open(f"/proc/{pid_str}/cmdline", "rb") as f:
                    cmdline = f.read().replace(b"\x00", b" ").decode("utf-8", "replace")
            except OSError:
                continue
            if "reaper" not in cmdline:
                continue
            idx = cmdline.find(prefix)
            if idx == -1:
                continue
            after = cmdline[idx + len(prefix): idx + len(prefix) + 1]
            if after in ("", " "):
                pids.append(int(pid_str))
        return pids

    async def _terminate_game(self, appid: str) -> bool:
        pids = self._scan_reaper_pids(appid)
        if not pids:
            decky.logger.warning(f"Timeout: reaper not found for appid={appid}; cannot terminate")
            return False
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError as e:
                decky.logger.error(f"Timeout: SIGKILL pid={pid} failed: {e}")
        decky.logger.info(f"Timeout: SIGKILLed reaper pids {pids} for appid={appid}")
        return True

    async def report_game_session_started(self, app_id: str, app_name: str = "") -> dict:
        """Frontend game-start hook. Returns a launch decision."""
        await self._daily_rollover_check()
        # Focus enforcement tier (sub-project C) - checked before game limits.
        focus = await self._get_focus_state()
        if focus.get("active") and not focus.get("is_break", False):
            ftier = focus.get("tier", "soft")
            if ftier == "hard":
                # Hard focus: terminate the game immediately.
                ok = await self._terminate_game(app_id)
                if ok:
                    await decky.emit("timeout_game_terminated", {"appid": app_id, "reason": "focus_hard"})
                else:
                    await decky.emit("timeout_game_terminate_failed", {"appid": app_id, "reason": "focus_hard"})
                return {"limited": True, "blocked": "focus_hard", "appid": app_id, "app_name": app_name}
            if ftier == "medium":
                # Medium focus: warn but allow the launch.
                await decky.emit("timeout_game_warning", {"appid": app_id, "reason": "focus_medium", "message": "Focus session active"})
            # soft: silent
        cfg = await self._get_game_limits_config()
        if not cfg.get("enabled") or not self._is_limited(app_id, cfg):
            return {"limited": False}
        rule = self._effective_rule(cfg, app_id)
        state = await self._get_game_limits_state()
        entry = state.get(app_id)
        entry = self._new_state_entry(rule) if entry is None else self._maybe_reset_daily(entry, rule)
        entry["app_name"] = app_name
        now = time.time()
        if rule.get("cooldown_enabled") and entry.get("cooldown_until") and now < entry["cooldown_until"]:
            state[app_id] = entry; await self._save_game_limits_state(state)
            return {"limited": True, "blocked": "cooldown", "appid": app_id, "app_name": app_name}
        if rule.get("curfew_enabled") and self._now_in_curfew(rule) and not (rule.get("opens_enabled") and rule.get("opens_bypass_curfew")):
            state[app_id] = entry; await self._save_game_limits_state(state)
            return {"limited": True, "blocked": "curfew", "appid": app_id, "app_name": app_name}
        opens_outside_window = rule.get("opens_window_enabled") and not self._now_in_window(rule.get("opens_window_start", "00:00"), rule.get("opens_window_end", "00:00"))
        if rule.get("opens_enabled") and not opens_outside_window and entry.get("credits_remaining", 0) < 1:
            state[app_id] = entry; await self._save_game_limits_state(state)
            return {"limited": True, "blocked": "no_credits", "appid": app_id, "app_name": app_name}
        state[app_id] = entry; await self._save_game_limits_state(state)
        return {"limited": True, "mode": "choose", "appid": app_id, "app_name": app_name}

    async def choose_launch(self, app_id: str, choice: str) -> dict:
        cfg = await self._get_game_limits_config()
        rule = self._effective_rule(cfg, app_id)
        state = await self._get_game_limits_state()
        entry = state.get(app_id)
        entry = self._new_state_entry(rule) if entry is None else self._maybe_reset_daily(entry, rule)
        now = time.time()
        is_half = (choice == "half")
        opens_outside_window = rule.get("opens_window_enabled") and not self._now_in_window(rule.get("opens_window_start", "00:00"), rule.get("opens_window_end", "00:00"))
        if rule.get("opens_enabled") and not opens_outside_window:
            spend = 1 if is_half else 2
            if entry.get("credits_remaining", 0) < spend:
                return {"error": "no_credits"}
            entry["credits_remaining"] = entry.get("credits_remaining", 0) - spend
            await decky.emit("timeout_game_credits_changed", {"appid": app_id, "credits_remaining": entry["credits_remaining"]})
        entry["is_half_open"] = is_half
        entry["session_start"] = now
        entry["in_grace"] = False
        entry["grace_until"] = None
        entry["killed"] = False
        entry["five_min_offered"] = False
        # clear prior threshold-warning markers
        for k in [k for k in list(entry.keys()) if str(k).startswith("warned_")]:
            del entry[k]
        cap_minutes = rule.get("half_open_cap_minutes") if is_half else rule.get("time_cap_minutes")
        time_outside_window = rule.get("time_window_enabled") and not self._now_in_window(rule.get("time_window_start", "00:00"), rule.get("time_window_end", "00:00"))
        if rule.get("time_enabled") and not rule.get("opens_enabled") and cap_minutes and not time_outside_window:
            entry["session_cap_end"] = now + cap_minutes * 60
        else:
            entry["session_cap_end"] = None
        state[app_id] = entry
        await self._save_game_limits_state(state)
        payload = {"appid": app_id, "app_name": entry.get("app_name", ""), "mode": "half" if is_half else "full", "cap_end": entry["session_cap_end"]}
        await decky.emit("timeout_game_session_started", payload)
        if not self.game_limits_task or self.game_limits_task.done():
            self.game_limits_task = self.loop.create_task(self._game_limits_handler())
        return payload

    async def report_game_session_stopped(self, app_id: str) -> bool:
        state = await self._get_game_limits_state()
        entry = state.get(app_id)
        if not entry or not entry.get("session_start"):
            return True
        now = time.time()
        elapsed = now - entry.get("session_start", now)
        entry["time_consumed_today_sec"] = entry.get("time_consumed_today_sec", 0) + max(0, elapsed)
        was_killed = bool(entry.get("killed"))
        cfg = await self._get_game_limits_config()
        rule = self._effective_rule(cfg, app_id)
        if rule.get("cooldown_enabled") and rule.get("cooldown_minutes"):
            entry["cooldown_until"] = now + rule["cooldown_minutes"] * 60
        if not was_killed:
            entry["adherent_today"] = True
        entry["session_start"] = None
        entry["session_cap_end"] = None
        entry["in_grace"] = False
        entry["grace_until"] = None
        entry["is_half_open"] = False
        entry["killed"] = False
        state[app_id] = entry
        await self._save_game_limits_state(state)
        await decky.emit("timeout_game_session_stopped", {"appid": app_id, "reason": "terminated" if was_killed else "manual"})
        return True

    async def use_five_min_finish(self, app_id: str) -> bool:
        state = await self._get_game_limits_state()
        entry = state.get(app_id)
        if not entry or not entry.get("in_grace") or entry.get("five_min_finish_used"):
            return False
        cfg = await self._get_game_limits_config()
        rule = self._effective_rule(cfg, app_id)
        mins = rule.get("five_min_finish_minutes", 5)
        entry["five_min_finish_used"] = True
        entry["grace_until"] = time.time() + mins * 60
        state[app_id] = entry
        await self._save_game_limits_state(state)
        await decky.emit("timeout_game_warning", {"appid": app_id, "reason": "time_warn", "grace_remaining": mins * 60})
        return True

    async def _trip(self, appid: str, entry: dict, rule: dict, reason: str) -> bool:
        """Enter/escalate grace; SIGKILL on grace expiry. Returns True if state mutated."""
        now = time.time()
        if not entry.get("in_grace"):
            entry["in_grace"] = True
            grace = rule.get("grace_seconds", 60)
            entry["grace_until"] = now + grace
            await decky.emit("timeout_game_warning", {"appid": appid, "reason": reason, "grace_remaining": grace})
            return True
        if now >= entry.get("grace_until", 0):
            if not entry.get("five_min_finish_used") and not entry.get("five_min_offered"):
                entry["five_min_offered"] = True
                entry["grace_until"] = now + 30  # 30s to accept the finish
                await decky.emit("timeout_game_five_min_available", {"appid": appid})
                return True
            killed = await self._terminate_game(appid)
            entry["killed"] = True
            entry["session_start"] = None
            entry["session_cap_end"] = None
            entry["in_grace"] = False
            entry["grace_until"] = None
            if killed:
                await self._break_game_limits_streak()
                await decky.emit("timeout_game_terminated", {"appid": appid, "reason": reason})
            else:
                await decky.emit("timeout_game_terminate_failed", {"appid": appid})
            return True
        return False

    async def _game_limits_handler(self):
        """Background task: enforce opens/time/curfew per running limited AppID."""
        try:
            while True:
                cfg = await self._get_game_limits_config()
                state = await self._get_game_limits_state()
                dirty = False
                any_active = False
                for appid, entry in list(state.items()):
                    if not entry.get("session_start"):
                        continue
                    any_active = True
                    rule = self._effective_rule(cfg, appid)
                    opens_present = rule.get("opens_enabled", False)
                    time_present = rule.get("time_enabled", False) and not opens_present
                    curfew_present = rule.get("curfew_enabled", False)
                    curfew_trips = curfew_present and self._now_in_curfew(rule) and not (opens_present and rule.get("opens_bypass_curfew"))
                    if curfew_trips:
                        if await self._trip(appid, entry, rule, "curfew"):
                            dirty = True
                        continue
                    # Lazy-cap: if a time-window was outside at launch but is now inside, set the cap now.
                    time_outside_window = rule.get("time_window_enabled") and not self._now_in_window(rule.get("time_window_start", "00:00"), rule.get("time_window_end", "00:00"))
                    if time_present and not time_outside_window and not entry.get("session_cap_end"):
                        cap_min = rule.get("half_open_cap_minutes") if entry.get("is_half_open") else rule.get("time_cap_minutes")
                        if cap_min:
                            entry["session_cap_end"] = time.time() + cap_min * 60
                            dirty = True
                    if time_present and entry.get("session_cap_end"):
                        remaining = entry["session_cap_end"] - time.time()
                        if remaining <= 0:
                            if await self._trip(appid, entry, rule, "time"):
                                dirty = True
                            continue
                        for thr in rule.get("warn_thresholds_minutes", [5, 1]):
                            marker = f"warned_{thr}"
                            if remaining <= thr * 60 and not entry.get(marker):
                                entry[marker] = True
                                dirty = True
                                await decky.emit("timeout_game_warning", {"appid": appid, "reason": "time_warn", "grace_remaining": int(max(0, remaining))})
                if dirty:
                    await self._save_game_limits_state(state)
                if not any_active:
                    return  # nothing running; task restarts on next choose_launch
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            decky.logger.info("Timeout: Game Limits handler stopped")

    async def get_installed_games(self) -> list:
        """Return installed Steam games [{appid, name}] by scraping appmanifest_*.acf.
        Dependency-free regex parse (StateFlags 4 = fully installed). Best-effort."""
        games = []
        home = os.path.expanduser("~")
        steam_roots = [os.path.join(home, ".steam", "steam"), os.path.join(home, ".local", "share", "Steam")]
        libs = []
        for root in steam_roots:
            lf = os.path.join(root, "steamapps", "libraryfolders.vdf")
            if os.path.exists(lf):
                try:
                    with open(lf, "r") as f:
                        libs.extend(re.findall(r'"path"\s+"([^"]+)"', f.read()))
                except OSError:
                    pass
            libs.append(root)
        seen = set()
        for lib in libs:
            sap = os.path.join(lib, "steamapps")
            if not os.path.isdir(sap):
                continue
            try:
                manifests = os.listdir(sap)
            except OSError:
                continue
            for mf in manifests:
                if not (mf.startswith("appmanifest_") and mf.endswith(".acf")):
                    continue
                try:
                    with open(os.path.join(sap, mf), "r") as f:
                        txt = f.read()
                except OSError:
                    continue
                aid = re.search(r'"appid"\s+"(\d+)"', txt)
                nm = re.search(r'"name"\s+"([^"]*)"', txt)
                flags = re.search(r'"StateFlags"\s+"(\d+)"', txt)
                if not aid or not nm:
                    continue
                if flags and flags.group(1) != "4":
                    continue
                key = aid.group(1)
                if key in seen:
                    continue
                seen.add(key)
                games.append({"appid": key, "name": nm.group(1)})
        return games

    # ==================== SETTINGS METHODS ====================

    async def get_version(self) -> str:
        """Get plugin version from plugin.json."""
        try:
            plugin_dir = os.path.dirname(os.path.realpath(__file__))
            plugin_json_path = os.path.join(plugin_dir, "plugin.json")
            with open(plugin_json_path, 'r') as f:
                plugin_data = json.load(f)
            return plugin_data.get("version", "unknown")
        except Exception as e:
            decky.logger.error(f"Timeout: Failed to read plugin version: {e}")
            return "unknown"

    async def get_settings(self) -> dict:
        """Get user settings."""
        return await self._get_user_settings()

    async def update_settings(self, new_settings: dict) -> dict:
        """Update user settings."""
        current = await self._get_user_settings()
        current.update(new_settings)
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, current)
        
        
        # Update sleep inhibitor if prevent_sleep settings changed
        if any(k in new_settings for k in ("focus_prevent_sleep",)):
            await self._update_sleep_inhibitor()
                
        await self.settings_commit()
        
        await decky.emit("timeout_settings_updated", current)
        return current






    # ---------------- Parental controls (sub-project D) ----------------
    # NOTE: passcode is a plaintext STUB — not real authentication. Revisit before release.

    async def _parental_locked(self, feature: str) -> bool:
        pc = (await self._get_user_settings()).get("parental_controls", {})
        if not pc.get("enabled") or pc.get("mode") != "self":
            return False
        return feature in pc.get("locked_features", ["game_limits", "focus_tier", "take_a_break", "mindfulness"])

    async def get_parental_controls(self) -> dict:
        return (await self._get_user_settings()).get("parental_controls", DEFAULT_SETTINGS["parental_controls"])

    async def update_parental_controls(self, partial: dict) -> dict:
        # Gated: once enabled in self mode, you must unlock (admin) to change it.
        us = await self._get_user_settings()
        pc = json.loads(json.dumps(us.get("parental_controls", DEFAULT_SETTINGS["parental_controls"])))
        if pc.get("enabled") and pc.get("mode") == "self":
            return {"error": "parental_locked"}
        if "enabled" in partial:
            pc["enabled"] = bool(partial["enabled"])
        if "passcode" in partial:
            pc["passcode"] = str(partial["passcode"] or "")
        if "locked_features" in partial:
            pc["locked_features"] = list(partial["locked_features"])
        if "mode" in partial:
            pc["mode"] = partial["mode"]
        us["parental_controls"] = pc
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_settings_updated", us)
        return pc

    async def verify_parental_passcode(self, code: str) -> dict:
        us = await self._get_user_settings()
        pc = us.get("parental_controls", DEFAULT_SETTINGS["parental_controls"])
        if not pc.get("enabled"):
            return {"ok": True, "controls": pc}
        if pc.get("passcode") and str(code) == str(pc.get("passcode")):
            pc2 = json.loads(json.dumps(pc))
            pc2["mode"] = "admin"
            us["parental_controls"] = pc2
            await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
            await self.settings_commit()
            await decky.emit("timeout_settings_updated", us)
            return {"ok": True, "controls": pc2}
        return {"ok": False}

    async def lock_parental(self) -> bool:
        us = await self._get_user_settings()
        pc = json.loads(json.dumps(us.get("parental_controls", DEFAULT_SETTINGS["parental_controls"])))
        pc["mode"] = "self"
        us["parental_controls"] = pc
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_settings_updated", us)
        return True

    # ---------------- Mindfulness pause (universal friction) ----------------
    async def get_mindfulness(self) -> dict:
        return (await self._get_user_settings()).get("mindfulness", DEFAULT_SETTINGS["mindfulness"])

    async def update_mindfulness(self, partial: dict) -> dict:
        # Parental-gated: in self mode mindfulness is a locked feature — you cannot
        # disable your own friction without unlocking (admin). Free edit when controls are off.
        if await self._parental_locked("mindfulness"):
            return {"error": "parental_locked"}
        us = await self._get_user_settings()
        mf = json.loads(json.dumps(us.get("mindfulness", DEFAULT_SETTINGS["mindfulness"])))
        if "enabled" in partial:
            mf["enabled"] = bool(partial["enabled"])
        if "text" in partial:
            mf["text"] = str(partial["text"])
        if "cooldown" in partial:
            try:
                mf["cooldown"] = max(1, int(partial["cooldown"]))
            except Exception:
                pass
        if isinstance(partial.get("triggers"), dict):
            triggers = mf.get("triggers", {})
            for tid, tp in partial["triggers"].items():
                if isinstance(tp, dict) and "enabled" in tp:
                    triggers[tid] = {"enabled": bool(tp["enabled"])}
            mf["triggers"] = triggers
        us["mindfulness"] = mf
        await self.settings_setSetting(SETTINGS_KEY_SETTINGS, us)
        await self.settings_commit()
        await decky.emit("timeout_settings_updated", us)
        return mf

    async def get_mindfulness_effective(self, trigger: str) -> dict:
        """Resolve the effective pause config for a trigger. Never raises — missing
        block (migration race) yields enabled=False so the caller auto-proceeds."""
        mf = (await self._get_user_settings()).get("mindfulness", DEFAULT_SETTINGS["mindfulness"])
        trig = (mf.get("triggers") or {}).get(trigger, {})
        enabled = bool(mf.get("enabled")) and bool(trig.get("enabled", True))
        return {"enabled": enabled, "text": mf.get("text", ""), "cooldown": int(mf.get("cooldown", 0))}

    async def get_overlay_data(self) -> dict:
        """Get aggregated data for the in-game overlay.
        
        Returns upcoming alerts across all categories, filtered by user settings,
        sorted by trigger time, and capped at max_alerts.
        """
        user_settings = await self._get_user_settings()
        
        if not user_settings.get("overlay_enabled", False):
            return {"alerts": [], "settings": {}}

        display_mode = user_settings.get("overlay_display_mode", "both")
        if display_mode == "gaming_only" and not await self._is_game_running():
            return {"alerts": [], "settings": {}}
        if display_mode == "steam_only" and await self._is_game_running():
            return {"alerts": [], "settings": {}}
        
        max_alerts = user_settings.get("overlay_max_alerts", 3)
        time_window = user_settings.get("overlay_time_window", 6) * 3600  # hours to seconds
        now = time.time()
        cutoff = now + time_window
        use24h = user_settings.get("time_format_24h", True)
        
        alerts = []
        sleep_preventing_alerts = []  # Always shown, regardless of filters
        
        
        # Focus - always check for sleep-preventing
        focus = await self._get_focus_state()
        if focus.get("active") and focus.get("end_time"):
            remaining = int(focus["end_time"] - now)
            if remaining > 0:
                phase = "Break" if focus.get("is_break") else "Focus"
                session = focus.get("current_session", 1)
                is_preventing = user_settings.get("focus_prevent_sleep", False)
                alert = {
                    "id": "focus",
                    "category": "focus",
                    "label": f"{phase} #{session}",
                    "time": focus["end_time"],
                    "remaining": remaining,
                    "subtle_mode": user_settings.get("focus_subtle_mode", False),
                    "auto_suspend": False,
                    "prevent_sleep": is_preventing
                }
                if is_preventing:
                    sleep_preventing_alerts.append(alert)
                elif user_settings.get("overlay_show_focus", True):
                    alerts.append(alert)
        
        # Combine: sleep-preventing alerts first (sorted by time), then regular alerts
        sleep_preventing_alerts.sort(key=lambda a: a["time"])
        alerts.sort(key=lambda a: a["time"])
        
        # Merge: prioritize sleep-preventing, fill remaining slots with regular alerts
        # Remove duplicates (an alert might be in both lists if it's within time window AND preventing sleep)
        sleep_ids = {a["id"] for a in sleep_preventing_alerts}
        alerts = [a for a in alerts if a["id"] not in sleep_ids]
        
        combined = sleep_preventing_alerts + alerts
        combined = combined[:max_alerts]
        
        # Return overlay-relevant settings alongside alerts
        overlay_settings = {
            "enabled": user_settings.get("overlay_enabled", False),
            "display_mode": user_settings.get("overlay_display_mode", "both"),
            "position": user_settings.get("overlay_position", "top"),
            "position_x": user_settings.get("overlay_custom_x", 24),
            "position_y": user_settings.get("overlay_custom_y", 0),
            "text_size": user_settings.get("overlay_text_size", 12),
            "opacity": user_settings.get("overlay_opacity", 0.6),
            "time_format_24h": use24h
        }
        
        return {"alerts": combined, "settings": overlay_settings}

    async def export_backup(self) -> str:
        """Export user data (settings) to JSON string."""
        data = {
            "version": 1,
            "timestamp": time.time(),
            "user_settings": await self._get_user_settings()
        }
        return json.dumps(data, indent=2)

    async def export_backup_to_file(self, filepath: str) -> bool:
        """Export backup to a specific file."""
        try:
            # Expand ~ to user home
            filepath = os.path.expanduser(filepath)
            
            # Create directory if it doesn't exist
            directory = os.path.dirname(filepath)
            if directory and not os.path.exists(directory):
                os.makedirs(directory)
                
            json_str = await self.export_backup()
            
            with open(filepath, 'w') as f:
                f.write(json_str)
            
            decky.logger.info(f"Timeout: Backup exported to {filepath}")
            return True
        except Exception as e:
            decky.logger.error(f"Timeout: Export to file failed: {e}")
            return False

    async def import_backup_from_file(self, filepath: str) -> bool:
        """Import backup from a specific file."""
        try:
            # Expand ~ to user home
            filepath = os.path.expanduser(filepath)
            
            if not os.path.exists(filepath):
                decky.logger.error(f"Timeout: Import file not found: {filepath}")
                return False
                
            with open(filepath, 'r') as f:
                json_str = f.read()
                
            return await self.import_backup(json_str)
        except Exception as e:
             decky.logger.error(f"Timeout: Import from file failed: {e}")
             return False

    async def import_backup(self, json_str: str) -> bool:
        """Import user data from JSON string."""
        try:
            data = json.loads(json_str)
            
            # Basic validation
            if not isinstance(data, dict):
                return False
                
            # Restore components individually if present
                
                
                
            if "user_settings" in data:
                # Merge with defaults to ensure new settings exist
                settings_to_save = {**DEFAULT_SETTINGS, **data["user_settings"]}
                await self.settings_setSetting(SETTINGS_KEY_SETTINGS, settings_to_save)
                await self.settings_commit()
                await decky.emit("timeout_settings_updated", settings_to_save)
            
            # Emit general event so frontend can trigger full refresh
            await decky.emit("timeout_data_imported", True)
            
            decky.logger.info("Timeout: Backup imported successfully")
            return True
        except Exception as e:
             decky.logger.error(f"Timeout: Import failed: {e}")
             return False

    async def _get_user_settings(self) -> dict:
        saved = await self.settings_getSetting(SETTINGS_KEY_SETTINGS, {})
        merged = {**DEFAULT_SETTINGS, **saved}

        # Migrate old display mode values to new schema
        display_mode_map = {
            "menu_only": "steam_only",
            "gaming_and_menu": "both",
            "games_only": "gaming_only",
            "steamui_only": "steam_only",
            "steam_menu_only": "steam_only",
            "always": "both",
        }
        current_mode = merged.get("overlay_display_mode")
        if current_mode in display_mode_map:
            merged["overlay_display_mode"] = display_mode_map[current_mode]
        elif current_mode not in {"both", "steam_only", "gaming_only"}:
            merged["overlay_display_mode"] = "both"

        # Migrate old position values to new schema
        position_map = {
            "top": "default",
            "bottom": "default",
            "left": "default",
            "right": "default",
            "top-bar": "default",
            "bottom-bar": "default",
            "top-right": "default",
            "top-left": "default",
            "bottom-right": "default",
            "bottom-left": "default"
        }
        current_position = merged.get("overlay_position")
        if current_position in position_map:
            merged["overlay_position"] = position_map[current_position]
        elif current_position not in {"default", "custom"}:
            merged["overlay_position"] = "default"

        return merged

    async def _migrate_settings_schema(self):
        """One-time migration for updated overlay settings schema."""
        saved = await self.settings_getSetting(SETTINGS_KEY_SETTINGS, {})
        if not isinstance(saved, dict):
            return

        updated = dict(saved)
        changed = False

        # Migrate old display mode values to new schema
        display_mode_map = {
            "menu_only": "steam_only",
            "gaming_and_menu": "both",
            "games_only": "gaming_only",
            "steamui_only": "steam_only",
            "steam_menu_only": "steam_only",
            "always": "both",
        }
        current_display_mode = updated.get("overlay_display_mode")
        if current_display_mode in display_mode_map:
            updated["overlay_display_mode"] = display_mode_map[current_display_mode]
            changed = True

        # Migrate old position values to new schema
        position_map = {
            "top": "default",
            "bottom": "default",
            "left": "default",
            "right": "default",
            "top-bar": "default",
            "bottom-bar": "default",
            "top-right": "default",
            "top-left": "default",
            "bottom-right": "default",
            "bottom-left": "default"
        }
        current_position = updated.get("overlay_position")
        if current_position in position_map:
            updated["overlay_position"] = position_map[current_position]
            changed = True

        if "overlay_custom_x" not in updated:
            updated["overlay_custom_x"] = DEFAULT_SETTINGS["overlay_custom_x"]
            changed = True

        if "overlay_custom_y" not in updated:
            updated["overlay_custom_y"] = DEFAULT_SETTINGS["overlay_custom_y"]
            changed = True

        for stale_key in (
            "overlay_pixel_shift",
            "overlay_pixel_shift_interval",
            "overlay_pixel_shift_range",
            "overlay_position_steamui"
        ):
            if stale_key in updated:
                del updated[stale_key]
                changed = True

        # --- v2 strip: rename pomodoro_* settings keys → focus_* (idempotent) ---
        if "focus_work_duration" not in updated:
            _POMODORO_TO_FOCUS = {
                "pomodoro_sound": "focus_sound",
                "pomodoro_volume": "focus_volume",
                "pomodoro_subtle_mode": "focus_subtle_mode",
                "pomodoro_prevent_sleep": "focus_prevent_sleep",
                "pomodoro_work_duration": "focus_work_duration",
                "pomodoro_break_duration": "focus_break_duration",
                "pomodoro_long_break_duration": "focus_long_break_duration",
                "pomodoro_sessions_until_long_break": "focus_sessions_until_long_break",
                "pomodoro_suspend_behavior": "focus_suspend_behavior",
                "pomodoro_stats": "focus_stats",
                "pomodoro_daily_goal": "focus_daily_goal",
                "pomodoro_daily_goal_enabled": "focus_daily_goal_enabled",
                "overlay_show_pomodoros": "overlay_show_focus",
            }
            for _old, _new in _POMODORO_TO_FOCUS.items():
                if _old in updated:
                    if _new not in updated:
                        updated[_new] = updated[_old]
                    del updated[_old]
                    changed = True
            decky.logger.info("Timeout: Renamed pomodoro_* settings keys → focus_*")

        # Drop legacy timer_/alarm_/preset_ keys + stale overlay/prevent-sleep/pixel-shift keys removed in v2
        for _stale in list(updated.keys()):
            if (_stale.startswith("timer_") or _stale.startswith("alarm_")
                    or _stale.startswith("preset_") or _stale in (
                        "overlay_show_timers", "overlay_show_alarms", "snooze_duration",
                        "prevent_sleep_pomodoro", "prevent_sleep_alarms",
                        "prevent_sleep_alarms_window", "prevent_sleep_enabled",
                        "prevent_sleep_timers",
                        "pixel_shift_enabled", "pixel_shift_range",
                        "pixel_shift_interval_seconds")):
                del updated[_stale]
                changed = True

        # Rewrite tab_order: drop removed tabs, rename pomodoro → focus, default to ["focus"]
        _tab_order = updated.get("tab_order")
        if isinstance(_tab_order, list):
            _seen = set(); _new_order = []
            for _tab in _tab_order:
                if _tab in ("timers", "alarms"):
                    continue
                _tab = "focus" if _tab == "pomodoro" else _tab
                if _tab not in _seen:
                    _seen.add(_tab); _new_order.append(_tab)
            if not _new_order:
                _new_order = ["focus"]
            if _new_order != _tab_order:
                updated["tab_order"] = _new_order
                changed = True
        elif _tab_order is None:
            updated["tab_order"] = ["focus"]
            changed = True

        # --- v2 strip: rename active-state blob pomodoro_state → focus_state (idempotent) ---
        # Decky SettingsManager has no public delete; legacy key is nulled after copy.
        if await self.settings_getSetting(SETTINGS_KEY_FOCUS, None) is None:
            _legacy_state = await self.settings_getSetting("pomodoro_state", None)
            if _legacy_state is not None:
                await self.settings_setSetting(SETTINGS_KEY_FOCUS, _legacy_state)
                await self.settings_setSetting("pomodoro_state", None)
                changed = True
                decky.logger.info("Timeout: Renamed pomodoro_state blob → focus_state")


        # --- skeleton: seed new feature keys idempotently (B/C/D) ---
        for _new_key in ("game_limits_config", "focus_default_tier",
                          "focus_take_a_break_max_per_session", "parental_controls", "mindfulness"):
            if _new_key not in updated:
                updated[_new_key] = DEFAULT_SETTINGS[_new_key]
                changed = True

        if changed:
            await self.settings_setSetting(SETTINGS_KEY_SETTINGS, updated)
            await self.settings_commit()
            decky.logger.info("Timeout: Migrated overlay settings schema")

    # ==================== CORE SETTINGS METHODS ====================

    async def settings_read(self):
        decky.logger.info('Reading settings')
        return settings.read()

    async def settings_commit(self):
        decky.logger.info('Saving settings')
        return settings.commit()

    async def settings_getSetting(self, key: str, defaults):
        return settings.getSetting(key, defaults)

    async def settings_setSetting(self, key: str, value):
        return settings.setSetting(key, value)









    async def get_game_status(self) -> bool:
        """Get current game running status."""
        return await self._is_game_running()


    async def _is_game_running(self) -> bool:
        """Check if a game is currently running (updated by frontend)."""
        return self._game_running

    async def set_game_running(self, is_running: bool) -> bool:
        """Update game running state from frontend."""
        self._game_running = is_running
        decky.logger.info(f"Timeout: Game running state set to {is_running}")
        return True


    async def _check_missed_focus(self, start_time: float, end_time: float):
        """Check for focus session interruptions."""
        focus = await self._get_focus_state()
        if not focus.get("active"):
             return

        user_settings = await self._get_user_settings()
        behavior = user_settings.get("focus_suspend_behavior", "continue")
        
        if behavior == "pause":
             # Shift end_time by suspend duration
             suspend_duration = end_time - start_time
             if focus.get("end_time"):
                 focus["end_time"] += suspend_duration
                 await self._save_focus_state(focus)
                 decky.logger.info(f"Timeout: Focus paused during suspend. Extended by {suspend_duration:.0f}s")
                 
                 # Restart the task to respect new end time
                 if hasattr(self, 'focus_task') and self.focus_task:
                     self.focus_task.cancel()
                 self.focus_task = self.loop.create_task(self._focus_handler())
             return
        
        # Else "continue" (Report Missed)
        p_end = focus.get("end_time", 0)
        # Check if it finished during suspend window
        if p_end <= end_time:
             # Session finished during suspend
             
             # Cancel existing handler first to prevent double-fire
             if hasattr(self, 'focus_task') and self.focus_task:
                 self.focus_task.cancel()
                 self.focus_task = None
             
             # Add missed item
             label = "Focus Break" if focus.get("is_break") else "Focus Focus"
             finished_at_str = datetime.fromtimestamp(p_end).strftime('%H:%M')
             details = f"Session finished at {finished_at_str}"
             
             await self._add_missed_item("focus", "focus-session", label, p_end, details)
             
             # Mark inactive
             focus["active"] = False
             focus["remaining"] = 0
             await self._save_focus_state()
             
             await decky.emit("timeout_focus_updated", focus)

    # ==================== LIFECYCLE METHODS ====================

    async def _suspend_monitor(self):
        """Monitor for system suspend/resume events via time jumps."""
        decky.logger.info("Timeout: Suspend monitor started")
        self.last_tick = time.time()
        
        while True:
            try:
                await asyncio.sleep(1)
                now = time.time()
                
                # Check for significant time jump (>5s) indicating suspend
                if now - self.last_tick > 5:
                    jump_duration = now - self.last_tick
                    decky.logger.info(f"Timeout: Suspend detected! Jumped {jump_duration:.1f}s")
                    
                    user_settings = await self._get_user_settings()
                    
                    # Run historical checks (Missed Alerts Report logic)
                    if user_settings.get("missed_alerts_enabled", True):
                        # Determine check window
                        window_hours = user_settings.get("missed_alerts_window", 24)
                        check_start = max(self.last_tick, now - (window_hours * 3600))
                        
                        
                        # Run historical checks for Focus ONLY if mode is CONTINUE
                        
                        if user_settings.get("focus_suspend_behavior", "continue") == "continue":
                            await self._check_missed_focus(check_start, now)

                    # Run Pause (Shift) logic regardless of missed_alerts_enabled
                    # Shift logic handles its own behavior check internally
                    
                    if user_settings.get("focus_suspend_behavior", "continue") == "pause":
                        await self._check_missed_focus(self.last_tick, now)
                        
                    # Wait briefly for synchronous checkers to resume
                    await asyncio.sleep(1)
                    
                    # Notify about new items in the report if applicable
                    if user_settings.get("missed_alerts_enabled", True):
                        all_missed = await self.settings_getSetting("missed_alerts_items", [])
                        recent_missed = [i for i in all_missed if i.get("missed_at", 0) >= self.last_tick]
                        
                        if recent_missed:
                            count = len(recent_missed)
                            decky.logger.info(f"Timeout: Emitting missed items: {count}")
                            await decky.emit("timeout_missed_items_toast", count)

                self.last_tick = now
            except asyncio.CancelledError:
                break
            except Exception as e:
                decky.logger.error(f"Timeout: Suspend monitor error: {e}")
                await asyncio.sleep(5)

    async def _main(self):
        """Plugin initialization."""
        self.loop = asyncio.get_event_loop()
        
        await self.settings_read()
        await self._migrate_settings_schema()

        current_time = time.time()
        # Resume Focus if active
        focus = await self._get_focus_state()
        if focus.get("active") and focus.get("end_time"):
            if focus["end_time"] > current_time:
                decky.logger.info("Timeout: Resuming Focus session")
                self.focus_task = self.loop.create_task(self._focus_handler())
        
        
        # Resume Game Limits enforcement if any session is active
        _gl_state = await self._get_game_limits_state()
        if any(e.get("session_start") for e in _gl_state.values()):
            decky.logger.info("Timeout: Resuming Game Limits enforcement")
            self.game_limits_task = self.loop.create_task(self._game_limits_handler())

        # Start suspend monitor
        self.suspend_monitor_task = self.loop.create_task(self._suspend_monitor())
        
        # Check and activate sleep inhibitor if any alerts require it
        await self._update_sleep_inhibitor()
        
        decky.logger.info("Timeout: Plugin initialized successfully")

    async def factory_reset(self) -> bool:
        """Factory reset - restore all settings to defaults and clear all data."""
        try:
            decky.logger.info("Timeout: Starting factory reset...")
            
            
            
            # 3. Cancel Focus task
            if self.focus_task:
                self.focus_task.cancel()
                self.focus_task = None

            # 3b. Cancel Game Limits task
            if self.game_limits_task:
                self.game_limits_task.cancel()
                self.game_limits_task = None
            
            # 4. Cancel suspend monitor
            if self.suspend_monitor_task:
                self.suspend_monitor_task.cancel()
                self.suspend_monitor_task = None
            
            # 5. Reset settings to defaults
            await self.settings_setSetting(SETTINGS_KEY_SETTINGS, DEFAULT_SETTINGS)
            
            # 6. Clear all data keys
            await self.settings_setSetting(SETTINGS_KEY_FOCUS, {
                "active": False,
                "is_break": False,
                "current_session": 1,
                "end_time": None,
                "duration": 0
            })
            await self.settings_setSetting(SETTINGS_KEY_GAME_LIMITS, {})
            await self.settings_setSetting("missed_alerts_items", [])
            
            # 7. Reset Focus stats
            await self.settings_setSetting("focus_stats", {
                "daily_focus_time": 0,
                "daily_break_time": 0,
                "daily_sessions": 0,
                "daily_cycles": 0,
                "total_focus_time": 0,
                "total_break_time": 0,
                "total_sessions": 0,
                "total_cycles": 0,
                "last_active_date": "",
                "daily_history": [],
                "current_streak": 0,
                "longest_streak": 0
            })
            
            # 8. Commit all changes
            await self.settings_commit()
            
            # 9. Emit update events to frontend
            await decky.emit("timeout_settings_updated", DEFAULT_SETTINGS)
            await decky.emit("timeout_focus_updated", {
                "active": False,
                "is_break": False,
                "current_session": 1,
                "end_time": None,
                "duration": 0
            })
            await decky.emit("timeout_missed_items_updated", [])
            
            # 10. Restart background tasks
            self.suspend_monitor_task = self.loop.create_task(self._suspend_monitor())
            
            decky.logger.info("Timeout: Factory reset completed successfully")
            return True
            
        except Exception as e:
            decky.logger.error(f"Timeout: Factory reset failed: {e}")
            return False

    async def _unload(self):
        """Plugin unload cleanup."""
        
        
        # Cancel Focus
        if self.focus_task:
            self.focus_task.cancel()

        # Cancel Game Limits
        if self.game_limits_task:
            self.game_limits_task.cancel()
        
        # Cancel suspend monitor
        if self.suspend_monitor_task:
            self.suspend_monitor_task.cancel()
        
        decky.logger.info("Timeout: Plugin unloaded")

    async def _uninstall(self):
        """Plugin uninstall cleanup."""
        decky.logger.info("Timeout: Plugin uninstalled")

    async def _migration(self):
        """Plugin migration."""
        decky.logger.info("Timeout: first run (no legacy data to migrate)")
