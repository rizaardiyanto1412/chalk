# Frame exports

Selected HTML and image frames have an **Export frame** toolbar button with PNG, JPEG, HTML, and PDF options. **File > Export Selection** has the same formats and requires exactly one selected frame. Both paths use the native save dialog. The toolbar also has **Copy as PNG**. HTML frames retain **Copy HTML** and **Open in your browser**.

PNG and JPEG use the frame's current width and height at 1× scale. Resized images use the canvas crop, with `object-fit: cover` and `object-position: top`. JPEG uses Electron's native encoder at quality 90 and a white background. PNG clipboard output has the same rendered pixels as PNG file output.

PDF contains one page with no margins. The page dimensions are the frame dimensions divided by 96, in inches. Content below the frame is clipped. PDF uses Chromium printing, including any print styles in the frame.

HTML embeds an image frame's source image as a data URL. HTML frames embed literal project asset URLs in markup, `srcset`, and CSS. Supported forms are `/assets/name`, `assets/name`, `./assets/name`, and absolute URLs on Chalk's loopback server. Linked project CSS also embeds its local images, imported stylesheets, and fonts. Asset files must be directly inside the project's `assets` folder. Traversal, symbolic links, special files, and unknown resource types fail with an error. Ordinary text, code samples, scripts, and non-media links are preserved.

Remote images, fonts, Tailwind, and Iconify remain remote in exported HTML. Exports with supported literal asset references can move between folders, but may require a network connection. HTML frames reflow at the browser window width when opened separately. Asset URLs constructed dynamically by frame scripts are not embedded. Private raster and PDF rendering blocks live requests to loopback addresses and the Chalk server port, so dynamically constructed local requests cannot read another project's assets.

## Shared MCP tools

`export_frame` accepts `id` and `format`. Valid formats are `png`, `jpeg`, `html`, and `pdf`. Output goes to the captured project's `exports` folder with a generated safe filename. JPEG uses the `.jpg` extension. The result includes `path`, `projectDir`, `format`, `bytes`, `width`, `height`, and the captured `updatedAt`.

The tool cannot select an output path. Unknown arguments do not redirect output. Repeated exports of the same frame and format replace the earlier file atomically. Temporary filenames are unique. An existing `exports` symbolic link or non-folder causes an error.

`copy_frame_image` accepts `id` and writes the rendered PNG to the system clipboard. It creates no export file.

## Ownership and verification

`src/main/export.ts` captures frame, project, and local asset bytes before any dialog or rendering await. Its `buildExport` function supplies UI saves, MCP exports, and clipboard images. Exports do not dispatch document operations or modify `chalk.json`. Canceling the save dialog returns `status: 'canceled'` and writes nothing. UI results distinguish `saved`, `canceled`, and `error`, with a visible activity notice.

Export windows are offscreen and sandboxed. A separate in-memory session blocks file URLs and live project endpoints. Preview tokens and render windows are removed in `finally`. There is no HTTP export route. Existing `screenshot_frame` and `review_frame` behavior is unchanged, including original image-reference screenshots.

`scripts/export-e2e.mjs` runs within `npm run e2e`. It checks format signatures, PNG pixels and dimensions, JPEG background, PDF page count and physical size, URL-context rewriting and loopback-alias blocking, image crop and portable HTML, clipboard pixels, toolbar clicks, File menu behavior, cancel and error results, unsafe paths, and project switches during pending exports. The project-switch checks also change the original frame dimensions and asset bytes after capture. Export fixtures are removed before the existing persistence checks. Save dialogs are stubbed at the native boundary and menu commands are invoked through Electron. These checks do not exercise the native dialog UI. PDF content is not raster-compared.
