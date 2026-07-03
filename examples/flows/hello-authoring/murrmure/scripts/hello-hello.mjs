#!/usr/bin/env node
/** Hello step — echoes input for flows tutorial smoke. */
const input = JSON.parse(process.env.MURRMURE_INPUT ?? "{}");
console.log(JSON.stringify({ greeting: `Hello, ${input.name ?? "author"}!` }));
