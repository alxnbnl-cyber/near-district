# Jurisdiction & launch gates

Using decentralized technology does not make Yielvy compliant anywhere. Real-money operation stays off until each gate is signed off by qualified counsel for each target market.

| Area | Questions to answer | Status |
|---|---|---|
| Operator structure | Which entity operates Yielvy, where, and under which terms? | Open |
| Digital assets | Does holding/routing sponsor USDC through a vault we upgrade count as custody or a regulated service (e.g. MiCA CASP, US state MTL, MAS DPT)? | Open |
| Custody obligations | Disclosures, segregation, insurance, incident reporting | Open |
| AML / sanctions | Sponsor KYB above thresholds; sanctions screening of sponsor and winner wallets; travel rule applicability | Open — wallet screening hook not built |
| KYC for winners | Thresholds per jurisdiction for prize payouts | Open |
| Consumer protection | Clear risk disclosure for sponsors (done in UI), refund/exit terms | Partly done |
| Privacy | GDPR/PDPA: minimal data (no raw IPs stored), DSAR process, retention schedule | Partly done |
| Prize promotions | Skill vs chance; free entry (V1 is always free); random draws need per-country approval (`RANDOM_DRAW_ALLOWED_COUNTRIES`) | Draws disabled by default |
| Tax | Reporting obligations for prizes and platform fees | Open |
| Terms & disclosures | User terms, organizer terms, risk disclosure, privacy policy | Not drafted |

Product controls already in place: participation is free; random draws are off everywhere until configured; organizers can exclude countries per campaign; the worker/web read a CDN country header for enforcement; funding is disabled until a vault is configured.
