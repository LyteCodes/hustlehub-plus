#import "@preview/basic-report:0.5.0": *
#import "obsidian.typ": render_markdown

#show: it => basic-report(
  doc-category: "Report",
  doc-title: "Security",
  author: "Sky Martin - ST10286905, Lyle William Richardson - ST10322521, James Marshall - ST10434366, Connaire Myall - ST10297849",
  language: "en",
  it,
)

#render_markdown(
  "main.md"
)

#pagebreak()

#bibliography(
  "Citations/references.bib",
  title: "References",
  style: "ieee",
)

#pagebreak()

#render_markdown(
  "AI Disclosure.md",
  file-headings: true,
)
