import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("places proposal save action after full recipe details", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const templateStart = html.indexOf('<template id="proposal-template">');
  const templateEnd = html.indexOf("</template>", templateStart);
  const template = html.slice(templateStart, templateEnd);
  const headerStart = template.indexOf('<div class="recipe-card-header">');
  const headerEnd = template.indexOf("</div>", template.indexOf("</div>", headerStart) + 1);
  const bodyStart = template.indexOf('<div class="recipe-body">');
  const sourceIndex = template.indexOf('class="recipe-source"', bodyStart);
  const saveIndex = template.indexOf('class="save-button"', bodyStart);

  assert.equal(template.slice(headerStart, headerEnd).includes("save-button"), false);
  assert.ok(sourceIndex > bodyStart);
  assert.ok(saveIndex > sourceIndex);
});
