import "reflect-metadata";

import { configure } from "japa";
import sourceMapSupport from "source-map-support";

sourceMapSupport.install({ handleUncaughtExceptions: false });
configure({
  //...processCliArgs(process.argv.slice(2)),
  files: ["tests/**/*.spec.ts"],
});
