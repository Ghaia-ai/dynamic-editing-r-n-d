# industry landscape survey -- pdf editing approaches beyond a/b/c/d

> status: draft, 2026-04-25
> derived from: web survey of vendor docs, papers, forum threads (sources at bottom)
> supersedes: nothing -- additive to `approach-matrix.md`

## why

`approach-matrix.md` enumerated four candidates (a: extract-to-structure, b: pdf->html->pdf, c: overlay, d: layout-ai). question we hadn't answered: *what do commercial vendors and the SOTA actually use under the hood, and is there a genuinely novel approach we've missed?*

answer: ten distinct techniques surveyed, exactly one is novel relative to a/b/c/d. the rest collapse into vendor variants of c, intermediate-format variants of b, or "doesn't apply to flat exports".

## the only new candidate: localized diffusion glyph inpainting

### approach e -- diffusion-based glyph inpainting on rasterized regions

- **technique**: rasterize the page, mask the target text region, run a diffusion model that inpaints new text with controlled glyph + position + style (font supplied as conditioning), composite the inpainted region back into the original PDF as a clipped image overlay.
- **primitives** (open weights, GPU inference):
  - **anytext2** (`arXiv:2411.15245`, march 2025) -- multilingual incl. arabic, lets you supply a font file as conditioning. directly relevant.
  - **textdoctor** (`arXiv:2503.04021`, march 2025) -- document-domain inpainting, trained at high resolution, claims SOTA on document images.
  - **diffute** (NeurIPS 2023) -- earlier text-image inpainting baseline.
- **why this is interesting for our problem**:
  - the failure modes our overlay (c) cannot fix are exactly: edits over gradients (cover-rect can't sample a single bg colour), glyph runs fragmented across multiple `Tj` operators (overlay primitive lands in the wrong span), heavily subsetted fonts where even HarfBuzz fallback substitutes visibly.
  - diffusion inpainting is *agnostic to the underlying PDF structure*. a numeric-replacement edit becomes a 200x60px mask + new text + font-conditioning input.
- **known failure modes**:
  - rasterization is destructive: the output for that region is a rendered PNG, not vector. composite-mask approach mitigates but doesn't eliminate.
  - sub-12pt glyphs hallucinate strokes, especially on thin numeric digits. needs eval at our actual fontsize range (12-28pt observed in samples).
  - font matching is similarity-based, not byte-equal -- will fail strict pixel-equality tests but may pass perceptual SSIM.
- **cost**: open weights, A10-class inference, 2-10 s / edit. no API cost.
- **evidence on positioned-canvas PDFs specifically**: not yet evaluated in the public literature for illustrator / canva exports. *no public benchmark on our exact input distribution.*
- **arabic support**: anytext2 explicitly trained multilingual incl. arabic with custom-font conditioning. no published RTL-specific eval but the architecture supports it.

**recommendation**: open as **e8 -- localized diffusion inpainting** experiment. 2-day spike. methodology:
- inputs: same two sample posters + one synthetic poster with a gradient background
- font conditioning: pass the embedded Lusail-Regular and Lusail-Bold buffers (already extracted by `overlay.py`)
- method: render edit region to PNG, run anytext2 with new value as text input + font as conditioning, composite output back into the page via `page.insert_image(rect, pixmap=...)` 
- metric: masked-region SSIM + human eyeball pass on glyph correctness for both latin and arabic

if SSIM > 0.99 on the edited region with pixel-correct numerals, e becomes our v1 fallback when c fails.

## the rest: variants of approaches we've already evaluated

### vendor variants of approach c (overlay / redact + reinsert)

| vendor | primitive | arabic? | our verdict |
|---|---|---|---|
| **apryse webviewer 10.3+** | paragraph segmentation + text-box-scoped reflow | claims yes; subsetted-font fallback substitutes | productized version of c. baseline-to-beat. ~$15-50k/yr. **1-day eyeball spike worth running** to know if commercial SOTA matches our overlay on the two samples; not worth licensing without measured win. |
| **nutrient (pspdfkit) content editor** | same as apryse | **explicitly LTR-only**, arabic unsupported | dead on arrival for our scope. |
| **foxit `FSPDF_TextObject_SetUnicodeString`** | direct content-stream `Tj`/`TJ` operator rewrite | needs exact shaped CID sequence for arabic | structurally more fragile than c -- can't paint a fresh background, breaks on subset embeds, breaks on illustrator-style scattered glyph runs. confirmed by foxit's own docs. **skip.** |
| **adobe acrobat 2025 "auto adjust layout"** | similar paragraph-reconstruction | "may or may not work efficiently depending on the layout" | desktop-only, no headless server SDK for this primitive. **skip for automation.** |
| **aspose.pdf replace text** | regex-based text replacement on content stream | aspose forum: "arabic text replace adds weird space and font" | known broken on arabic. **skip.** |

verdict: approach c (our overlay) **is** the industry-standard primitive for this problem. apryse and nutrient are productized versions of the same idea. our open-source implementation already matches latin SSIM > 0.9998 and handles arabic via insert_htmlbox (which nutrient does not). running an apryse comparison would be *informative* but doesn't open a new research direction.

### intermediate-format variants of approach b (round-trip)

| primitive | failure mode | our verdict |
|---|---|---|
| pdf -> svg (proper svg, text nodes) -> dom edit -> pdf | inkscape forums: ligatures break, font substitution kicks in even with embedded fonts. arabic ligatures *guaranteed* to break. | structurally a worse version of b. **skip.** |
| pdf -> markdown (marker, nougat, mathpix) -> render | re-rendered markdown != original poster. extraction-accurate but visually different. | b with extra steps. **skip.** |
| ABBYY finereader reconstructive edit | full document reconstruction via OCR + layout. output is no longer the input PDF -- it's a regenerated lookalike. | destructive same as b. unlikely to beat overlay's 0.9998 SSIM. **skip.** |

### "doesn't apply to flat exports"

| approach | why dead | our verdict |
|---|---|---|
| acroform / xfa fast-path | illustrator and canva exports are flat -- no `/AcroForm`, no `/StructTreeRoot` | confirmed dead. **add a one-line precondition check** so future tagged-PDF inputs short-circuit. |
| document AI services as edit producers (azure DI, google document AI, aws textract) | all three emit read-only JSON with bboxes; no service writes a PDF back | already covered as approach d (detector primitive only). **no change.** |
| canva / figma "import PDF as editable layers" plugins (codia ai, pdf.to.design) | proprietary black-box services. canva help: "designs with layers, gradients, masks aren't supported" | not viable as backend dependency (data residency, SLA). flag as **manual-fallback** if workflow ever pivots to "user edits in figma". |

### closed-API multimodal image edit

- **gpt-image-1.5** (`images.edit`, dec 2025) and **gemini 2.5 flash image**: same shape as e (raster + mask + prompt), but closed-weights, no font conditioning, and openai community thread (aug 2025) reports the masked-inpaint endpoint *replaces the entire image* in many cases.
- **verdict**: weaker than open-weights diffusion (#e) on every axis. **skip.**

## summary

after surveying the field:

1. our existing approach c is, in fact, the same primitive every commercial vendor uses for this problem, just open-source rather than productized. our masked SSIM > 0.9998 on both samples and our arabic support via `insert_htmlbox` are *competitive with* the vendor space, not behind it.
2. the only genuinely novel candidate is **localized diffusion inpainting (e)** -- worth a 2-day spike to know whether it's a viable v1 fallback for the failure modes c can't handle (gradients, fragmented spans, heavily subsetted fonts).
3. apryse webviewer is a useful **baseline-to-beat**, not a new primitive. 1-day eyeball comparison if budget permits.
4. acroform fast-path is a free precondition check we should add regardless.

## sources

vendor docs:
- adobe acrobat: <https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/modify-text.html>
- apryse webviewer: <https://docs.apryse.com/web/guides/edit/text-edit>, <https://apryse.com/blog/webviewer/pdf-editing-in-webviewer-10-7>
- apryse community on text reflow: <https://community.apryse.com/t/is-it-possible-to-replace-text-in-webviewer-and-have-it-reflow/10122>
- nutrient (pspdfkit): <https://pspdfkit.com/pdf-sdk/web/content-editor/>
- foxit text-object set unicode: <https://developers.foxit.com/developer-hub/document/edit-text-pdf-using-foxit-pdf-sdk/>
- foxit `Tj` position editing: <https://developers.foxit.com/developer-hub/document/get-text-object-position-pdf-file-change-content-text-object/>
- aspose.pdf replace text: <https://docs.aspose.com/pdf/net/replace-text-in-pdf/>
- aspose forum, arabic replace bug: <https://forum.aspose.cloud/t/arabic-text-replace-in-pdf-using-aspose-pdf-rest-api-adds-weird-space-and-font/15034>
- aspose forum, position issues: <https://forum.aspose.com/t/replace-pdf-text-using-aspose-pdf-for-net-text-overlapping-and-change-in-text-position/209177>
- abbyy finereader pdf editor: <https://pdf.abbyy.com/how-to/edit-pdf/>
- pikepdf content streams: <https://pikepdf.readthedocs.io/en/latest/topics/content_streams.html>
- itext pdf object replacement: <https://kb.itextpdf.com/home/it7kb/examples/replacing-pdf-objects>
- canva pdf import help: <https://www.canva.com/help/pdf-import/>
- pdf.to.design figma plugin: <https://www.figma.com/community/plugin/1280917768965269588/pdf-to-design-by-divriots-import-any-pdf-to-figma>
- codia ai pdf plugin: <https://www.figma.com/community/plugin/1395769067119787232/codia-ai-pdf-import-pdf-to-editable-figma-layers>

papers:
- diffute (NeurIPS 2023): <https://proceedings.neurips.cc/paper_files/paper/2023/file/c7138635035501eb71b0adf6ddc319d6-Paper-Conference.pdf>
- anytext2 (`arXiv:2411.15245`): <https://arxiv.org/html/2411.15245v1>
- textdoctor (`arXiv:2503.04021`): <https://arxiv.org/abs/2503.04021>
- text image inpainting via global structure-guided diffusion (`arXiv:2401.14832`): <https://arxiv.org/abs/2401.14832>
- omnidocbench (CVPR 2025): <https://openaccess.thecvf.com/content/CVPR2025/papers/Ouyang_OmniDocBench_Benchmarking_Diverse_PDF_Document_Parsing_with_Comprehensive_Annotations_CVPR_2025_paper.pdf>

community threads:
- pdf -> svg breakage: <https://gist.github.com/douglasmiranda/9c19f23c4570a7b7e02137791880ab43>
- inkscape pdf -> svg: <https://inkscape.org/forums/beyond/converting-vector-pdf-to-svg-in-inkscape/>
- openai images.edit replaces full image: <https://community.openai.com/t/image-editing-inpainting-with-a-mask-for-gpt-image-1-replaces-the-entire-image/1244275>

azure / cloud:
- azure document intelligence v4.0: <https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/whats-new?view=doc-intel-4.0.0>

acroform / xfa:
- datalogics xfa vs acroforms: <https://www.datalogics.com/cracking-the-code-managing-pdf-forms>
- foxit acroforms vs xfa: <https://www.foxit.com/blog/acroforms-vs-xfa-forms/>
