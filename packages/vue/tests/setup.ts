import { setScriptFreeze } from '@brass-lantern/engine';

// The engine's freeze is off by default; tests run with it on so a script that
// assigns to state throws instead of passing silently (as in the engine's tests).
setScriptFreeze(true);
