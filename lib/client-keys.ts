let n = 0;
/** Stable React keys for rows added on the client (no crypto dependency, works on any phone). */
export const newKey = () => `k${Date.now().toString(36)}${(n++).toString(36)}`;
