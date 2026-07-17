import { demoRoutes } from "../data/routes";
import type { RouteProvider } from "./RouteProvider";

export class DemoRouteProvider implements RouteProvider {
  async getRoutes(originId: string, destinationId: string) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (originId !== "shinjuku-west" || destinationId !== "tocho") throw new Error("このデモで選択できる区間ではありません。");
    return structuredClone(demoRoutes);
  }
}
