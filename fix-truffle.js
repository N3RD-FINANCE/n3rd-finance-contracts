const fs = require("fs");

const FILE_NAME = "./node_modules/truffle/build/cli.bundled.js";

const OLD_STR = "display_path = \".\" + path.sep + path.relative(options.working_directory, import_path);";
const NEW_STR = "if (options.fix_paths) {display_path = \".\" + path.sep + path.relative(options.working_directory, import_path); result[display_path] = result[import_path]; delete result[import_path];}";

console.log("Fixing " + FILE_NAME);
const data = fs.readFileSync(FILE_NAME, { encoding: "utf8" });
fs.writeFileSync(FILE_NAME, data.split(OLD_STR).join(NEW_STR), { encoding: "utf8" });