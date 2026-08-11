import { useCallback } from 'react';
import { callable } from '@decky/api';
import type { SoundFile } from '../types';

// Backend callables
const getSoundsCall = callable<[], SoundFile[]>('get_sounds');
const importCustomSoundsCall = callable<[], { success: boolean; message: string; imported: number; errors: string[] }>('import_custom_sounds');
const getSoundDataCall = callable<[filename: string], { success: boolean; data: string | null; mime_type: string | null; error?: string }>('get_sound_data');

export function useSounds() {
    // Get available sounds
    const getSounds = useCallback(async (): Promise<SoundFile[]> => {
        try {
            return await getSoundsCall();
        } catch (e) {
            console.error('Failed to get sounds:', e);
            return [{ filename: 'alarm.mp3', name: 'Alarm' }];
        }
    }, []);

    // Import custom sounds (rescan ~/Music/Timeout_Sounds)
    const importCustomSounds = useCallback(async () => {
        try {
            return await importCustomSoundsCall();
        } catch (e) {
            console.error('Failed to import sounds:', e);
            return { success: false, message: 'Failed to call backend', imported: 0, errors: [String(e)] };
        }
    }, []);

    // Play custom sound via base64 -> HTML5 Audio (proper Steam audio routing)
    const playCustomSound = useCallback(async (filename: string, volume: number = 100): Promise<HTMLAudioElement | null> => {
        try {
            const result = await getSoundDataCall(filename);
            if (!result.success || !result.data || !result.mime_type) {
                console.error('Failed to load custom sound:', result.error);
                return null;
            }

            const byteCharacters = atob(result.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: result.mime_type });
            const blobUrl = URL.createObjectURL(blob);

            const audio = new Audio(blobUrl);
            audio.volume = Math.min(1, Math.max(0, volume / 100));
            audio.onended = () => URL.revokeObjectURL(blobUrl);
            audio.onerror = () => URL.revokeObjectURL(blobUrl);
            await audio.play();
            return audio;
        } catch (e) {
            console.error('Failed to play custom sound:', e);
            return null;
        }
    }, []);

    return {
        getSounds,
        importCustomSounds,
        playCustomSound,
    };
}
