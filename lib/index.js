/**
 * dsh-mdview — host half.
 *
 * Pure UI plugin: everything happens in the browser half (`./client`), which
 * registers a Markdown implementation into the right-sidebar document preview's
 * registry. The empty apply exists so the plugin shows up in the profile tree;
 * the browser half ships via exports["./client"], discovered through the
 * package.json `dsh.client` declaration.
 */

/** Host plugin body — no host-side behaviour for this surface plugin. */
export function apply() {}
