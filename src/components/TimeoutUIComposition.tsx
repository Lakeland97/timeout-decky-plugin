import { useUIComposition, UIComposition } from "../utils/uiComposition";
import { useSettings } from "../hooks/useSettings";
import { useSleepInhibitor } from "../hooks/useSleepInhibitor";
import { useGameStatus } from "../hooks/useGameStatus";
import { useOverlayData } from "../hooks/useOverlayData";
import { useMissedAlerts } from "../hooks/useMissedAlerts";

export function TimeoutUIComposition() {
    const { settings } = useSettings();
    const { isActive: inhibitorActive } = useSleepInhibitor();
    const isGameRunning = useGameStatus();
    const alerts = useOverlayData(settings, isGameRunning);
    const { hasNewMissedAlerts } = useMissedAlerts();

    const hasContent =
        alerts.length > 0 ||
        inhibitorActive ||
        hasNewMissedAlerts;

    const displayMode = settings.overlay_display_mode || "both";
    const hudHiddenByDisplayMode =
        (displayMode === "gaming_only" && !isGameRunning) ||
        (displayMode === "steam_only" && isGameRunning);

    const needsNotificationHud =
        (settings.overlay_enabled ?? false) &&
        hasContent &&
        !hudHiddenByDisplayMode;

    const level = needsNotificationHud
        ? UIComposition.Notification
        : UIComposition.Hidden;

    useUIComposition(level);

    return null;
}
