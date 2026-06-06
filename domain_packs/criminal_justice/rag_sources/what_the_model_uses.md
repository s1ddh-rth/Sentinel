# What the Risk Model Uses (and Does Not Use)

Illustrative reference material for the SENTINEL assistant describing the model's inputs and design.

## Features the model uses
The risk score is produced from a small set of risk-relevant features: age at release, prior arrest
episodes (violent, property, drug), prior felony convictions, the proportion of days employed,
positive drug tests, gang affiliation, education level, and first supervision level. These are the
fields shown in the case view's detailed-factors panel.

## Protected attributes are excluded from scoring
Race and gender are **not** features of the model — the risk score is computed without them. They are
retained only to audit the model for fairness. Because correlated proxy features (such as prior-arrest
counts, employment, or neighbourhood) can still carry demographic signal, excluding race is not by
itself sufficient for fairness; the platform therefore audits and mitigates disparity explicitly.

## How the HIGH-risk flag is set
The risk score itself is attribute-blind. To equalise the rate at which different groups are flagged
HIGH, the HIGH-risk threshold is calibrated per demographic group at the decision step. This is a
transparent, documented fairness-through-awareness choice; the score shown to the officer is the same
race-blind probability regardless of group.

## Calibration and uncertainty
Scores are Platt-calibrated, so a 0.30 score means roughly a 30% observed reoffence rate among
similar people. Each score carries a split-conformal interval; for an individual the interval is
often wide, reflecting genuine uncertainty about a single person's outcome.
