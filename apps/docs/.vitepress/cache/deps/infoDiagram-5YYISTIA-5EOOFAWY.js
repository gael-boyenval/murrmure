import {
  parse
} from "./chunk-DHWMTYO4.js";
import "./chunk-4NDACRD3.js";
import "./chunk-AXIY4GHK.js";
import "./chunk-IGCQCM2K.js";
import "./chunk-A4KJ3L2K.js";
import "./chunk-SW7ANJBI.js";
import "./chunk-TSPPW5SY.js";
import "./chunk-2P2BW5G4.js";
import "./chunk-QZPKAEQX.js";
import "./chunk-7XWMPWPV.js";
import "./chunk-JNTII6NV.js";
import "./chunk-RFOENNYQ.js";
import {
  selectSvgElement
} from "./chunk-LWHY24BR.js";
import {
  configureSvgSize
} from "./chunk-C2Z3PZYK.js";
import {
  __name,
  log
} from "./chunk-H35OXIYD.js";
import "./chunk-EQCVQC35.js";

// ../../node_modules/.pnpm/mermaid@11.15.0/node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-5YYISTIA.mjs
var parser = {
  parse: __name(async (input) => {
    const ast = await parse("info", input);
    log.debug(ast);
  }, "parse")
};
var DEFAULT_INFO_DB = {
  version: "11.15.0" + (true ? "" : "-tiny")
};
var getVersion = __name(() => DEFAULT_INFO_DB.version, "getVersion");
var db = {
  getVersion
};
var draw = __name((text, id, version) => {
  log.debug("rendering info diagram\n" + text);
  const svg = selectSvgElement(id);
  configureSvgSize(svg, 100, 400, true);
  const group = svg.append("g");
  group.append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${version}`);
}, "draw");
var renderer = { draw };
var diagram = {
  parser,
  db,
  renderer
};
export {
  diagram
};
//# sourceMappingURL=infoDiagram-5YYISTIA-5EOOFAWY.js.map
