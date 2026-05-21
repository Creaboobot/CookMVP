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

test("removes proposal save action from saved library detail clones", async () => {
  const source = await readFile(new URL("../public/recipe.js", import.meta.url), "utf8");
  const renderLibraryStart = source.indexOf("function renderLibrary()");
  const cloneHelperStart = source.indexOf("function cloneSavedRecipeDetailBody()");
  const cloneHelperEnd = source.indexOf("function savedRecipeMetaText", cloneHelperStart);
  const renderLibrary = source.slice(renderLibraryStart, cloneHelperStart);
  const cloneHelper = source.slice(cloneHelperStart, cloneHelperEnd);

  assert.match(renderLibrary, /const detailBody = cloneSavedRecipeDetailBody\(\);/);
  assert.match(cloneHelper, /querySelector\("\.recipe-save-row"\)\?\.remove\(\);/);
  assert.doesNotMatch(cloneHelper, /querySelector\("\.save-button"\)\?\.remove\(\);/);
});
