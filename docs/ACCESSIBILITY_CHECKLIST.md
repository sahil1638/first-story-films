# Accessibility Checklist

Target: WCAG 2.2 AA for staff dashboard workflows and public inquiry.

## Required Checks Before Release

| Area | Check | Status |
|------|-------|--------|
| Keyboard | Every link, button, input, select, modal action, table action, and sidebar control is reachable with `Tab` and `Shift+Tab`. | Pending |
| Keyboard | Focus order follows the visual layout and does not jump unexpectedly. | Pending |
| Keyboard | Forms can be submitted without a mouse where appropriate. | Pending |
| Focus | Visible focus styles are present on interactive controls. | Pending |
| Focus | Modal focus is trapped while open and returns to the opener when closed. | Pending |
| Labels | Every input, textarea, and select has a programmatic label. | Pending |
| Icon buttons | Icon-only actions have `aria-label` or equivalent accessible names. | Pending |
| Tables | Data tables expose meaningful headers and row actions have clear names. | Pending |
| Errors | Validation errors are associated with the relevant field and announced or visible near the field. | Pending |
| Contrast | Normal text contrast is at least 4.5:1; large text and graphical controls are at least 3:1. | Pending |
| Zoom | Pages remain usable at 200% browser zoom. | Pending |
| Responsive | Mobile drawer, forms, tables, and PDFs controls are usable at narrow widths. | Pending |
| Motion | No essential workflow depends on animation. | Pending |
| Alerts | Avoid native `alert()` for routine feedback; prefer accessible modal, toast, or inline messaging. | Pending |
| Page titles | Route titles and headings clearly identify the current workflow. | Pending |

## Public Inquiry Flow

- [ ] First focusable element is sensible after page load.
- [ ] Step navigation works with keyboard only.
- [ ] Required fields expose visible and programmatic required state.
- [ ] Date, phone, budget, and agreement validation errors are readable and field-specific.
- [ ] Agreement acceptance is not preselected.
- [ ] Success page announces completion clearly.

## Dashboard Shell

- [ ] Sidebar toggle has an accessible name.
- [ ] Current navigation item is identifiable without color alone.
- [ ] Mobile menu can be opened, traversed, and closed with keyboard.
- [ ] Content is not hidden behind fixed navigation at common viewport sizes.
- [ ] Logout is reachable and named.

## Tables And Row Actions

- [ ] Empty states are readable.
- [ ] Pagination buttons are named and disabled states are exposed.
- [ ] Edit, delete, convert, print, download, and status actions are named by record context where practical.
- [ ] Status selects have labels that identify the record or status type.
- [ ] Confirmation dialogs identify the destructive action and target record.

## Forms

- [ ] Labels are visible and tied to controls.
- [ ] Inputs use appropriate `type`, `inputMode`, and autocomplete where useful.
- [ ] Error summaries or inline errors are visible after failed submission.
- [ ] Disabled submit states do not strand keyboard users without explanation.
- [ ] Server errors are shown in the page, not only the console.

## PDF And Print

- [ ] Download buttons have accessible names.
- [ ] Loading states announce progress or remain visually clear.
- [ ] PDF failure states explain retry options.
- [ ] Print pages preserve readable contrast.

## Manual Test Matrix

| Browser/AT | Scope |
|------------|-------|
| Chrome keyboard-only | Public inquiry and core dashboard workflows |
| Firefox + NVDA | Public inquiry, login, lead table, modal actions |
| Safari + VoiceOver | Public inquiry and PDF controls |
| Mobile viewport | Navigation drawer, public inquiry, lead/order detail pages |

## Automated Checks

Recommended additions:

- Add `@axe-core/playwright` checks to Playwright smoke tests.
- Add an accessibility test for `/inquiry`, `/login`, `/dashboard`, `/leads`, `/orders/[id]`, and `/accounting`.
- Fail CI on serious and critical axe violations.

Example target command once axe tests are added:

```bash
npm run test:e2e
```

## Known Follow-Ups

- Replace remaining native `alert()` usage with the shared alert modal, toast, or inline error component.
- Add skip link to dashboard content if keyboard testing shows repeated navigation burden.
- Add route-level error states where server failures currently fall through to generic errors.
