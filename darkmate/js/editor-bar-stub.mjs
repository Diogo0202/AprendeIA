// Local stand-in for ./editor-bar-stub.mjs.
// The Framer editor bar is useless on a self-hosted export and would make an
// external request on every page view, so createEditorBar renders nothing.
export const createEditorBar = () => () => null;
export default createEditorBar;
