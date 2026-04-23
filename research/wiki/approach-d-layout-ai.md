# approach d — ai-assisted layout understanding

> status: resolved by deep-research report, 2026-04-23. earlier placeholder replaced.
> owner: elaa
> source report: `./deep-research-report-dynamic-editing.md` (original verbatim)
> consumed by: `./approach-matrix.md`

## resolution summary (for the matrix)

the deep-research recommends a **hybrid architecture**, not a single-vendor pick:

-   **primary detector: azure document intelligence read/layout.** real ocr geometry with word/line confidence, paragraph-level roles (title, section heading, page header/footer, page number), and layout key-value features. arabic documented (with caveats on mixed-script reading order).
-   **fallback verifier: gemini 2.5 pro.** native pdf understanding + strict json schema output. ocrbench v2 ranks gemini 2.5 pro above gpt-4o, claude sonnet 4 on ocr-heavy work.
-   **semantic pairing stage: ours to build.** between azure output and downstream consumer, we need a lightweight clusterer that pairs nearby text into candidate `(label, value)` tuples and discards decorative text. this is the part no vendor solves for us.

```
pdf bytes
  ↓
azure document intelligence read/layout
  ↓  words + lines + paragraphs + roles + confidence
  ↓
pairing stage (ours)
  ↓  candidate {label, value, bbox, confidence}
  ↓
low-confidence rows → gemini 2.5 pro verifier (over crops, not full pages)
  ↓
final list[PDFFieldDefinition]-equivalent
```

## why this changes e4

the original e4 plan was a bake-off across frontier vlms (gpt-4o, gemini, claude, layoutlmv3, donut, doclaynet). the deep-research already did that exercise and ranked them. e4 becomes a **hybrid-feasibility test**, not a detection bake-off:

-   run azure doc-intel on both sample pdfs.
-   measure word-level and paragraph-level recall against a hand-labelled ground-truth field list.
-   build the pairing-stage heuristic (proximity + font-contrast + role-type filter).
-   for the cases where azure returns low confidence or ambiguous structure, crop the candidate regions and send to gemini 2.5 pro with a strict json schema.
-   measure end-to-end recall/precision + cost + latency of the hybrid.

kill criterion unchanged (recall < 80%). but the new e4 is cheaper to run because we're no longer paying for 6+ vendor trials.

## arabic reading-order risk (from the report)

azure documents that **ambiguous reading order falls back to left-to-right, top-to-bottom**. on arabic posters with mixed arabic text and latin numerals, that is the exact failure pattern we care about. the report flags this as a "serious warning sign." e5 (arabic stress test) is unchanged in scope but now knows where to look first: not "does azure read arabic," but "does azure return mixed-script content in logical order or does it silently linearise it ltr+ttb."

## integration note for the matrix

the matrix d row changes from "tbd / interim azure" to:

> **primary: azure document intelligence read/layout. fallback: gemini 2.5 pro on cropped candidate regions (not full pages). semantic pairing stage is ours to build.**

approach d is still a shared primitive, not a standalone editor. it pairs with approach c (overlay) for the edit step in class (a) and (c) pdfs, and with approach a (extract) for structural synthesis.

## the full deep-research report

the body below is reproduced verbatim from the deep-research agent, 2026-04-23. citation turn references (`citeturnNviewM`) are the original agent's linkbacks into its own source dossier and do not resolve outside it; treat as "there is a cited source in the agent's transcript." the working-conclusion content above is derived from this body plus the codebase audit in `./bug-context.md`.

---

## bottom line

For your specific problem—single-page poster or infographic PDFs with heavy design, about 10 editable fields, strict recall and precision targets, a hard cost ceiling of $0.05 per PDF, a roughly 10-second latency target, and a requirement to work on Arabic RTL posters—the strongest production choice is **Microsoft Azure Document Intelligence Read/Layout as the primary detector**, followed by a **small semantic verification step** rather than trusting any one model end to end. The reason is simple: this is the only option in your list that natively returns **real OCR words and lines with positions and confidence**, plus paragraph-level roles, at document-service economics. The tradeoff is that it does **not** natively solve the harder part of your task—turning arbitrary poster text into semantic `(bbox, label, current value, confidence)` records—so you still need a second pass for label/value pairing and for rejecting decorative text.

If you want a pure multimodal fallback, **Gemini 2.5 Pro** is the best backup among the frontier VLMs you named. The current Gemini API supports **native PDF understanding** and **JSON Schema structured outputs**, and the public OCR-heavy benchmarks I found put the Gemini family ahead of GPT-4o and Claude on hard OCR/document-parsing tasks. The catch is that Gemini, like GPT and Claude, does **not** give you a native OCR-box stream for text the way Azure does; any text bbox you get is model-generated rather than OCR-grounded, so I would not trust it without verification.

The single most important conclusion is that **no candidate here should be trusted "raw" for final editable-field extraction on chaotic posters**. The closest you can get is: use a geometry-true OCR/layout engine for first-pass text detection, then use a cheaper semantic pass to decide which text blocks are editable fields, which are labels, and which are current values. That architecture is much more likely to hit your recall/precision floor than asking one frontier VLM to hallucinate boxes and field roles directly.

## task assumptions and what matters

I am assuming the operational unit is **a one-page PDF poster or infographic**, which matches your examples and keeps the cost/latency discussion meaningful. On that assumption, the real problem is not basic OCR. It is **field discovery under design noise**: headings, slogans, captions, legal text, decorative numerals, icons, rotated text, and mixed typography all compete with the small subset of strings you actually want to edit later. That makes a "good OCR model" different from a "good editable-field detector." The latter needs both **geometry** and **semantics**.

The benchmark literature reinforces that point. The CC-OCR paper explicitly concludes that even the best evaluated multimodal models were still **below practical-deployment thresholds** on challenging OCR-centric tasks, and it highlights weak visual grounding, brittleness under rotation, and worse multilingual performance for languages including Arabic relative to Latin-family languages. The newer OCRBench v2 leaderboard likewise shows large spreads across models in recognition, extraction, parsing, understanding, and reasoning rather than a single universally dominant "document AI" winner.

Two planning notes matter. First, the **latency numbers below are engineering ranges**, not vendor-published p50s for your exact poster workload; most vendors publish API shape, pricing, and qualitative speed rather than audited "single-page poster PDF" timings. Second, for **Arabic/RTL**, the question is not only "can the model read Arabic?" but also "what order does it return mixed Arabic and Latin numerals in?" In the sources I found, only Azure documents reading-order behavior in a way that lets you reason concretely about this; the frontier VLM APIs generally do not make a clear logical-order vs visual-order guarantee for Arabic OCR output.

## candidate-by-candidate assessment

**OpenAI GPT-4o and GPT-5.4.** The current OpenAI API supports **image input** and **Structured Outputs**, and the current frontier entry for this family is GPT-5.4 rather than a separate "GPT-5 vision" SKU. OpenAI also publishes enough image-tokenization detail to make cost budgeting possible: GPT-4o uses tile-based image tokenization with base and tile token charges, while GPT-5.4 and later models add an `original` detail mode specifically recommended for localization and click-accuracy use cases. That means you can absolutely ask this family to return a strict bbox schema, but the boxes are **model-decoded coordinates**, not native OCR detections tied to word-level confidence objects. On OCRBench v2, GPT-5's published score is better than GPT-4o's, but both trail Gemini 2.5 Pro. In CC-OCR's harder 2024-era evaluation, GPT-4o also trailed Gemini 1.5 Pro on multilingual OCR and document parsing. For your use case, GPT-4o is the faster and cheaper OpenAI variant; GPT-5.4 is the more accurate escalation path, but I would still treat either as a **semantic verifier or low-confidence fallback**, not as the sole source of truth for bboxes. Budgetarily, one-page poster extraction is usually well under your $0.05 cap at published token rates; the practical range is roughly low single-digit cents per page, depending mainly on rasterization detail and output verbosity. Arabic is supported in the broad "multilingual capabilities" sense, but I found no OpenAI doc that guarantees Arabic logical-order output, and the public OCR benchmark evidence says Arabic-class languages are still harder than Latin scripts.

**Google Gemini 2.5 Pro.** Gemini is the cleanest frontier-VLM fit if you insist on one multimodal model that can consume a PDF and emit a strict JSON object. The Gemini API supports **native PDF document understanding** and **JSON Schema structured output**, and the current pricing page lists Gemini 2.5 Pro at **$1.25 per million input tokens and $10 per million output tokens** for prompts up to 200k tokens. In the public OCRBench v2 leaderboard, Gemini 2.5 Pro substantially outperforms GPT-4o on the OCR-heavy aggregate. The earlier CC-OCR paper found Gemini 1.5 Pro best among the tested closed models on multi-scene OCR, multilingual OCR, and document parsing, which is the best family-level evidence I found for chaotic poster-like material rather than invoices alone. The downside is the same as with OpenAI: Gemini does not expose a native word/line OCR-box stream in the way a document OCR service does, so bounding boxes are still best treated as **model-produced coordinates** that need checking. In cost terms, Gemini 2.5 Pro easily fits your budget for a one-page poster; even fairly generous token assumptions keep it in the sub-cent to low-cents band per page. My planning estimate is that it can often land within your latency envelope on one-page posters, but dense visual pages can still be borderline. For Arabic, the family-level evidence is encouraging but not clean enough to skip validation: CC-OCR explicitly notes that languages such as Arabic underperform Latin-family languages on the multilingual track, and Google's docs do not, in the sources I found, make an explicit logical-order guarantee for Arabic output. I would use Gemini as the **best single-model fallback** and as a strong semantic classifier/verifier over OCR crops.

**Azure Document Intelligence Read/Layout.** This is the strongest geometry-first option in your list. The Read/OCR stack returns **pages, text lines, and words with location and confidence scores**; the Layout model returns **paragraphs with bounding polygons** and can assign limited logical roles such as `title`, `sectionHeading`, `pageHeader`, `pageFooter`, and `pageNumber`. The current v4 guidance also tells you that if you want key-value extraction in general documents, you should use **Layout with `features=keyValuePairs`** rather than the deprecated general-document path. For your problem, that means Azure gives you what the frontier VLMs usually do not: **real OCR geometry and confidence objects** that are stable enough to build deterministic downstream logic on top of. The weakness is semantic coverage. The paragraph-role taxonomy is narrow, and the key-value feature was designed for documents in a broader "forms and documents" sense, not for arbitrary graphic posters where labels and values are embedded into art direction. I did **not** find a credible vendor-published benchmark for chaotic posters specifically. On Arabic, Azure has the most concrete documentation: Arabic is supported and auto-detected, but the service states that content is sorted by reading order and that when paragraph/layout reading order is ambiguous it generally falls back to **left-to-right, top-to-bottom** order. That is a serious warning sign for RTL posters with mixed Arabic and numerals: the OCR itself may still be good, but you should not assume perfect semantic ordering without a normalization pass. The service pricing page in the captured HTML exposes the SKU structure—Read, Layout/prebuilt, add-ons, batch, commitment tiers—but the numeric price fields were not present in the accessible HTML capture I could cite. So I am comfortable saying it is typically in the **low-cents-per-page** class and should fit your budget, but I am not going to invent an audited exact figure from a page capture that omitted the numbers. Trust level: **high for text geometry, medium for paragraph roles, low if used alone for final field labeling.**

**LayoutLMv3 self-hosted.** LayoutLMv3 is still a serious document-AI backbone, but it is the wrong abstraction if you want an out-of-the-box poster-field extractor. The model is a **multimodal encoder** that combines text, image, and layout; in practice, for extraction tasks it still relies on upstream OCR text plus boxes before you fine-tune a downstream head such as token classification. Its paper reports state-of-the-art results at release on form understanding, receipt understanding, DocVQA, document image classification, and document layout analysis, but those are not the same as "editable field discovery in designer posters." For your use case, LayoutLMv3 only becomes strong after you build and label your own dataset of poster fields, run OCR first, then fine-tune for sequence labeling or span linking. That can work very well if you have data and want on-prem control; it is not what I would choose for a fast greenfield deployment. Arabic is possible in principle, but quality depends heavily on the OCR engine and your fine-tuning data, because the official sources do not give strong out-of-the-box Arabic poster evidence. Cost and latency can be excellent on a warm deployment, but at only 1,000 PDFs per month the **effective** cost depends more on infrastructure policy than model math; the operational burden is the bigger issue. Trust level: **low out of the box, potentially high after domain-specific fine-tuning.**

**Donut self-hosted.** Donut's core attraction is that it is **OCR-free and end-to-end**, and it can generate structured formats such as JSON directly from document images. That is elegant, and it does remove OCR error propagation. The problem is that it does **not natively solve your bbox requirement**. It is fundamentally a sequence generator, not a geometry-first OCR service. The original Donut work and official repository show strong performance on receipts, train tickets, and document parsing tasks, and the paper emphasizes language flexibility through synthetic pretraining and a multilingual decoder. But I found no strong evidence that the stock model is ready for Arabic RTL posters or that it can reliably emit trustworthy editable-field boxes on heavily designed infographics. In practice, you would end up reintroducing a separate detector or crop proposal stage, which defeats the simplicity that makes Donut attractive in the first place. Trust level: **not suitable as a direct answer to your schema because it lacks native field boxes.**

**DocLayNet-trained detectors.** This category is useful, but only if you are honest about what it does. DocLayNet is a **document layout segmentation dataset** with **11 box labels**: Caption, Footnote, Formula, List-item, Page-footer, Page-header, Picture, Section-header, Table, Text, and Title. The dataset was purpose-built because PubLayNet/DocBank style models degrade on more diverse layouts, and the DocLayNet paper shows that even strong detectors remain about **10 points behind inter-annotator agreement** on the harder setup. It also explicitly says the label set deliberately avoids semantic labels such as author or affiliation because those require textual semantics beyond pure visual layout recognition. That is the key issue for you: a DocLayNet-style detector can tell you where big text regions are, but not whether a text region is an editable field label, a value, or just decorative narrative copy. It is therefore a useful **pre-segmentation or region proposal** engine, but not a full solution. If you choose this route, you still need OCR plus a semantic linker on top. Trust level: **good for coarse text-block finding, poor for end-to-end editable-field extraction.**

## challengers you should not ignore

**Mistral AI Mistral OCR 3 is the missing commercial challenger that matters more than Pixtral.** Pixtral Large is now the wrong place to invest: Mistral's own model card marks Pixtral Large as deprecated and replaced by Mistral Large 3. For document extraction, the more relevant current product is **OCR 3**, which is priced at **$2 per 1,000 pages** and **$3 per 1,000 annotated pages**, with a blog-stated **50% batch discount**. The OCR API supports structured outputs, OCR processing, annotations, and a document-AI workflow that returns markdown, table structure, dimensions, image bboxes, and confidence scores. That makes OCR 3 a very credible cost-and-structure challenger for document parsing. The main reason I still rank it below Azure for your exact task is that the public docs I found expose **image bboxes and document annotations**, not the sort of explicit word/line text-box geometry stream that is ideal for "every editable text field" extraction. So it looks very strong for **document understanding** and **structured extraction**, but less obviously perfect for **per-text-field bbox truth**. If I were adding one challenger to your bake-off, this would be it.

**Anthropic Claude Sonnet 4.5 or 4.6 is a verifier, not a primary detector.** Claude's API now supports structured outputs, and its PDF mode can do **full visual understanding** rather than text-only extraction. Anthropic documents that the visual PDF path processes each page as both text and image and uses about **7,000 tokens for a 3-page PDF**, which makes one-page cost budgeting easy and still within your cap at Sonnet pricing. The problem is the same one seen with OpenAI and Gemini: no native OCR word-box API. On OCRBench v2, Claude Sonnet 4 trails Gemini 2.5 Pro and GPT-family entries on OCR-heavy aggregate performance. So Claude is credible as a semantic adjudicator or a fallback reasoner, but it is not the first thing I would bet on for a bbox-first field extractor.

**Open-weight document AI has advanced fast enough that you should test one real open model, not just older academic baselines.** The best candidate I found is **PaddleOCR-VL**, from Baidu, plus the newer PP-DocLayoutV3 component. PaddleOCR-VL claims support for **109 languages**, including complex elements such as text, tables, formulas, and charts, and PP-DocLayoutV3 is explicitly described as predicting **multi-point layout boxes** and **reading order** for hard document images. Public discussion around PaddleOCR-VL also points to bbox-bearing JSON outputs. This is exactly the kind of open-weight stack that could become a strong self-hosted alternative if you want cost control and Arabic coverage. What I do **not** have yet is enough independent Arabic-poster benchmarking to rank it above Azure or Gemini for your current project. I would therefore treat PaddleOCR-VL as the **open-weight challenger most worth a focused pilot**, far ahead of leaning on old Donut-only or LayoutLMv3-only stacks.

## ranking and recommendation

My rank order for **your** use case is:

**First: Azure Document Intelligence Read/Layout.** It is the best match to your hard constraints because it gives true OCR geometry, word/line confidence, structured layout objects, Arabic support, and a service shape that is much easier to make deterministic. It is the best first-pass detector, not the best final decision-maker.

**Second: Gemini 2.5 Pro.** It is the strongest single frontier VLM fallback because it supports PDFs and strict JSON Schema output, and the available OCR/document-parsing evidence consistently places the Gemini family above GPT-4o and Claude for challenging OCR-like workloads.

**Third: the OpenAI family, but specifically GPT-4o for speed and GPT-5.4 only for escalation.** GPT-5.4 is the more capable current model, but the task is bottlenecked more by grounding than by long-chain reasoning. In practice I would usually try GPT-4o first and reserve GPT-5.4 for low-confidence or Arabic-hard cases.

**Fourth: Mistral OCR 3.** It is the best overlooked commercial document-AI challenger on cost and structure, and I would absolutely test it. I only keep it below Azure because the cited docs do not yet make a clean case that it gives you the per-text geometry stream you want for editable-field extraction.

**Fifth: PaddleOCR-VL plus PP-DocLayoutV3.** This is the open-weight route I would take seriously in 2026. It looks materially more relevant than Donut and more deployment-ready for multilingual parsing than older academic stacks. But for your decision today, it still needs a real Arabic poster bake-off before I would elevate it above the commercial APIs.

**Sixth: Claude Sonnet 4.5/4.6.** Strong verifier, weaker detector; useful, but not my preferred primary.

**Seventh: LayoutLMv3.** Only worth it if you can create training data and want a custom on-prem model.

**Eighth: DocLayNet detectors.** Helpful region proposal, not a complete field extractor.

**Ninth: Donut.** Elegant, but mismatched to the bbox-first requirement.

My recommendation is therefore:

**Primary: Azure Document Intelligence Read/Layout** as the detector of record. Use it to extract words, lines, paragraph boxes, paragraph roles, and confidence. Then run a lightweight pairing stage that clusters nearby text into candidate label/value sets and discards low-value decorative text. For low-confidence pages, verify only the candidate regions with Gemini 2.5 Pro rather than sending the whole page through a frontier VLM. That hybrid is the most realistic path to your recall/precision targets while staying under both the cost cap and the latency budget.

**Fallback: Gemini 2.5 Pro.** Use it either as a full-page fallback when Azure's geometric output is incomplete, or more efficiently as a verifier over cropped candidate regions plus OCR text. If you are already heavily in the OpenAI stack, GPT-4o is the operationally simpler alternative, but the benchmark evidence I found favors Gemini for difficult OCR/document-parsing behavior.

## open questions and limitations

The biggest gap in the public evidence is that **there is almost no clean, vendor-neutral benchmark specifically for "editable fields in chaotic posters/infographics," especially in Arabic RTL**. Most published results are on OCR-heavy scenes, document parsing, DocVQA, forms, tables, or general layout detection rather than your exact downstream target. That means the final call should come from a very small but disciplined evaluation set: your two sample PDFs, plus at least 20 to 50 Arabic poster pages with manually marked `(bbox, label, value)` ground truth.

The second gap is **pricing precision for Azure**. The captured pricing page clearly exposes the billing structure and SKU categories, but the numeric amounts were not present in the accessible HTML returned by the page capture I could cite. I have therefore treated Azure's cost as "very likely within budget" rather than pretending to have an audited exact cents-per-page number from a source that omitted it. Likewise, the frontier-VLM latency figures above are capacity-planning estimates rather than vendor-published single-page poster p50s.

---

(end of deep-research body. next-step implications for phase 3 are summarised at the top of this file.)
