SIH26231 SYNTHETIC PROTOTYPE DATASET
===========================================

Purpose
-------
This dataset is for developing and testing the computer-vision pipeline of the SIH26231 prototype.
ALL IMAGES ARE SYNTHETIC. They are NOT photographs of real controlled substances, real field-test
reactions, or validated forensic reference standards.

Classes
-------
positive:
  Synthetic reaction trajectory intentionally designed to show a strong, coherent colour response
  associated with the prototype reference profile for the named drug.

negative:
  Synthetic reaction intentionally remains near a neutral/background response.

inconclusive:
  Synthetic reaction is weak, unstable, partially developed, or otherwise ambiguous.

Important forensic limitation
------------------------------
These labels are NOT chemical truth. A real field-test system must derive its positive/negative/
inconclusive decision rules from the exact commercial kit's validated instructions, reference
materials, controlled experiments, and forensic validation. Do not deploy this synthetic dataset
for real-world drug identification or enforcement decisions.

Recommended model target
------------------------
Input: image of the test well.
Output:
  1) drug class hypothesis (7-way) OR "unknown/out-of-distribution"
  2) presumptive class: positive / negative / inconclusive
  3) confidence score
  4) quality flags (lighting, blur, glare, occlusion)

Recommended real-world safety behavior
--------------------------------------
If image quality is poor, colour is outside the validated reference range, multiple reactions are
present, or confidence is below the validated threshold: return INCONCLUSIVE and require human/
laboratory review.

Dataset split
-------------
Train: 40 images per class per drug
Validation: 10 images per class per drug
Test: 10 images per class per drug
Total: 1260 images

Drugs represented
-----------------
Heroin, cocaine, methamphetamine, cannabis, MDMA, fentanyl, ketamine.

The drug list is a prototype scope based on the SIH project discussion. It is not a claim about
prevalence in India.

Why this dataset is synthetic
-----------------------------
Real forensic colour-test images require validated sample provenance and controlled experimental
conditions. Government sources such as NIST CADS provide authentic characterized samples/data, but
they should be treated as separate ground-truth/reference resources rather than mixed into this
synthetic training set without a documented provenance and validation protocol.
