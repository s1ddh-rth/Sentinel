# Fairness Safeguards and the Override Process

Illustrative reference material for the SENTINEL assistant on fairness monitoring and human override.

## Fairness as a release gate
Before any model is used in production it is audited for disparity across protected groups (race and
gender). Four metrics are tracked: statistical parity difference (SPD), disparate impact (DI), equal
opportunity difference (EOD), and predictive equality difference (PED). A model that breaches the
configured thresholds — SPD above 0.10, DI outside [0.80, 1.25], or EOD/PED above 0.10 — is blocked
from release until mitigated. Removing race from the feature set is not sufficient on its own, because
correlated proxy features can reintroduce disparity; mitigation is applied and the audit re-run.

## When to override
An officer should override a risk band when individual circumstances are not captured by the model:
for example, a documented change in living situation, completion of a treatment programme, or new
information about the index offence. Overrides require a reason code and free-text justification.

## Reason codes
Common reason codes include: NEW_EVIDENCE (material information not in the record), PROTECTIVE_FACTOR
(stabilising factor such as employment or housing), CLINICAL_JUDGEMENT (assessed need differs from
score), and DATA_QUALITY (suspected error in the underlying record). Every override is recorded in
the audit trail with the officer, timestamp, original band, and new band.

## Auditability
Every prediction and every override is logged immutably. The audit trail supports retrospective
review of both model behaviour and human decisions, and is the basis for ongoing fairness monitoring.
