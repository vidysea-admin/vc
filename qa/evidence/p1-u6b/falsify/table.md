| C1a | profile fit is a constant 0.5, so two profiles rank alike | 33/33 | 6 fail of 33 (killed) | C1 A16: a Germany/engineering student and a Canada/business student asking about the same  |
| C1b | duplicate option ids are not collapsed | 33/33 | 1 fail of 33 (killed) | C1 A16: the same student, same options and same weights ranked twice |
| C2a | no KB source id is cited | 33/33 | 2 fail of 33 (killed) | C2 A16: every ranked option names its KB source ids and the profile facts that moved its s |
| C2b | facts that moved the score are not reported | 33/33 | 6 fail of 33 (killed) | C2 A16: every ranked option names its KB source ids and the profile facts that moved its s |
| C3a | default fit weight 0.5 instead of 0.4 | 33/33 | 3 fail of 33 (killed) | C1 A16: scores are the weighted sum of the four components, fit comes from the confirmed f |
| C3b | default vector no longer named student-success | 33/33 | 2 fail of 33 (killed) | C3 P-8: a student who sets no weights is ranked with 0.40 / 0.25 / 0.20 / 0.15 and told ra |
| C4a | a supplied weight config is ignored | 33/33 | 5 fail of 33 (killed) | C4 D-086 Q3: a tenant that weights scholarship chance at 0.8 and fit at 0 changes the orde |
| C4b | rankingProfile is always student-success | 33/33 | 1 fail of 33 (killed) | C4 D-086 Q3: a tenant that weights scholarship chance at 0.8 and fit at 0 changes the orde |
| C4c | facts reported as used even at fit weight 0 | 33/33 | 1 fail of 33 (killed) | C4 D-086 Q3: a fit weight of zero means the profile facts moved nothing, so none are repor |
| C5a | the sign-in check is removed | 33/33 | 2 fail of 33 (killed) | C5 B24.8: a request with no authenticated student gets no ranking, whatever facts or optio |
| C5b | a blank student id counts as authenticated | 33/33 | 1 fail of 33 (killed) | C5 B24.8: a request with no authenticated student gets no ranking, whatever facts or optio |
| C5c | the data port is asked before the sign-in check | 33/33 | 1 fail of 33 (killed) | C5 B24.8: the refusal happens before the option-data port is asked anything |
| C6a | a proposed (unconfirmed) fact enters the ranking | 33/33 | 1 fail of 33 (killed) | C6 A16b: a fact the student has not confirmed |
| C6b | a fact with any source label enters the ranking | 33/33 | 1 fail of 33 (killed) | C6 A16b: a fact with an unknown source label is ignored and counted, never relabelled |
| C6c | a Pathlynks value beats the student's confirmed value | 33/33 | 1 fail of 33 (killed) | C6 A16b: when Pathlynks and the student give different values for one key, the student's c |
| C6d | every fact is relabelled student-confirmed | 33/33 | 4 fail of 33 (killed) | C2 A16: the top-level profileFactsUsed lists each fact once, with the exact source label i |
| C7a | an option with a missing number is ranked anyway (guessed as 0) | 33/33 | 6 fail of 33 (killed) | C6 A16b: a student who has only proposed facts |
| C7b | a number with no resolvable source is accepted | 33/33 | 1 fail of 33 (killed) | C7 B24.8: a number with no cited source, outside 0..1 or not finite is treated as missing, |
| C7c | an out-of-range number is accepted | 33/33 | 1 fail of 33 (killed) | C7 B24.8: a number with no cited source, outside 0..1 or not finite is treated as missing, |
| C7d | ties are not broken by option id | 33/33 | 1 fail of 33 (killed) | C7 B24.8: tied scores break by option id, whatever order the options arrived in |
| C7e | a missing component with zero weight still blocks ranking | 33/33 | 1 fail of 33 (killed) | C7 B24.8: a component whose weight is zero does not block ranking when its data is missing |
| C7f | the option cap is not enforced | 33/33 | 1 fail of 33 (killed) | C7 B24.8: more options than the cap, or none, is refused rather than truncated |
| C7g | insufficient options are listed before the ranked ones | 33/33 | 4 fail of 33 (killed) | C7 B24.8: an option whose cost the data port does not have is marked insufficient_data, li |
| C8a | a negative weight is accepted | 33/33 | 2 fail of 33 (killed) | C8 D-086 Q3: a weight vector with a negative, NaN, Infinity, string or missing component i |
| C8b | an unknown weight key is accepted | 33/33 | 1 fail of 33 (killed) | C8 D-086 Q3: an unknown weight key |
| C8c | an all-zero vector is accepted | 33/33 | 1 fail of 33 (killed) | C8 D-086 Q3: an all-zero vector is rejected |
| C8d | a vector not summing to 1 is not scaled | 33/33 | 2 fail of 33 (killed) | C3 P-8: explicitly passing the default vector, or a multiple of it, is still student-succe |
