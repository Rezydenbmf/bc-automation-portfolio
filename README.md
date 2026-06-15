\# BC Automation Portfolio



Sanitized portfolio version of a Python desktop automation project.



The original project automated a multi-step business portal workflow:

\- user registration,

\- user profile completion,

\- company creation,

\- second-step company completion,

\- input package preparation,

\- operator support and reporting helpers.



This repository is intended to show:

\- project structure,

\- modular automation design,

\- validation logic,

\- error handling approach,

\- data preparation workflow.



\## Security



This is not the original working repository.



Removed from the portfolio version:

\- real user and company data,

\- logs,

\- generated packages,

\- runtime workspace files,

\- screenshots,

\- browser state,

\- cookies,

\- tokens,

\- `.env` files,

\- private Git history,

\- production URLs.



\## Main modules



\- `src/fill\_profile.py` — user profile automation

\- `src/fill\_company.py` — company creation automation

\- `src/fill\_company\_step2.py` — second-step company flow

\- `src/company\_registry.py` — local registry/status helper

\- `src/input\_package\_generator/` — input package generator

\- `src/input\_package\_generator/Asystent Paczek/` — semi-automatic package assistant



\## Demo data



Safe sample files are in:



```text

examples/

