import { setScriptFreeze } from '@/engine/scripts';

// The engine's freeze is off by default; tests run with it on so a script that
// assigns to state throws instead of passing silently.
setScriptFreeze(true);
