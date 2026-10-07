/** App version from package.json, injected by Vite. */
declare const __APP_VERSION__: string;

/**
 * Developer escape hatch: true only when built or served with
 * VITE_ALLOW_BROWSER=true. Lets the app run in a browser tab instead of
 * showing the install gate. Never set it for a real deployment.
 */
declare const __ALLOW_BROWSER__: boolean;
