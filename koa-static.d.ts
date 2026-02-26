declare module 'koa-static' {
	import type { Middleware } from 'koa';
	function serve(root: string, opts?: Record<string, unknown>): Middleware;
	export default serve;
}
