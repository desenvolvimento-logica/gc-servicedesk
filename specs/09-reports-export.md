# 09 — Search, Reports and Export

## Required filters
Gestão de Cadastro must filter by at least:
- company name;
- company code;
- requester department;
- service;
- new service vs correction/rework;
- requester;
- status;
- opening period;
- closing period;
- assigned/servicing operator.

## Required indicators
The data model must support:
- request volume by department;
- request volume by service;
- request volume by period;
- average service time;
- percentage of correction/rework requests;
- rework distribution by original operator when traceable.

## Performance
Do not load all records into the browser and filter client-side. Use server-side filtering, pagination, indexed query paths, debounced search where useful and stable sorting.

## Dynamic-field reporting concern
Company name/code are service fields in much of the initial catalog. The database design must make filtering by these common values efficient. Claude Code must address this explicitly when proposing the typed dynamic-value strategy.

## Export
Authorized users must be able to export filtered data. Initial mandatory format: CSV. Excel may be added later.

The export must enforce the same authorization scope as the on-screen query and must not leak internal-only data to requesters.

## Power BI compatibility
Do not build Power BI in V1, but keep reporting tables/views/query shapes compatible with future Power BI consumption.
