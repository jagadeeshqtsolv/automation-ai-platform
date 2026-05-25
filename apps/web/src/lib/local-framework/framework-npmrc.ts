/** Forces public npm for per-project framework installs (avoids corporate registry timeouts). */
export const FRAMEWORK_PROJECT_NPMRC = `registry=https://registry.npmjs.org/
@jagadeeshqtsolv:registry=https://npm.pkg.github.com
`;

export const FRAMEWORK_NPMRC_FILENAME = ".npmrc";
