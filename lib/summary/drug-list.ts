/**
 * Common cardiology drugs (generic names), for the audit's `drug_extra` check (spec §5.2): if one of
 * these appears in a draft but no discharge medication in the input contains it, the model added a
 * drug. Lower case; matched as whole words, case-insensitively. Not a formulary — a tripwire.
 */
export const CARDIOLOGY_DRUGS: readonly string[] = [
  // antiplatelets
  "aspirin", "clopidogrel", "ticagrelor", "prasugrel", "cangrelor", "cilostazol", "dipyridamole",
  // anticoagulants
  "heparin", "enoxaparin", "fondaparinux", "bivalirudin", "warfarin", "acenocoumarol",
  "apixaban", "rivaroxaban", "dabigatran", "edoxaban",
  // lipid
  "atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "pitavastatin", "ezetimibe", "fenofibrate",
  // beta-blockers
  "metoprolol", "bisoprolol", "carvedilol", "nebivolol", "atenolol", "propranolol",
  // calcium-channel blockers
  "amlodipine", "nifedipine", "cilnidipine", "diltiazem", "verapamil",
  // ACE inhibitors / ARBs / ARNI
  "ramipril", "enalapril", "lisinopril", "perindopril", "losartan", "telmisartan", "valsartan",
  "olmesartan", "candesartan", "sacubitril",
  // diuretics / MRAs
  "spironolactone", "eplerenone", "furosemide", "torsemide", "hydrochlorothiazide", "chlorthalidone", "indapamide",
  // anti-anginal
  "isosorbide", "nitroglycerin", "glyceryl trinitrate", "gtn", "nicorandil", "ranolazine", "ivabradine", "trimetazidine",
  // rhythm / heart failure
  "digoxin", "amiodarone", "dapagliflozin", "empagliflozin",
  // common companions on a cath-lab discharge
  "metformin", "insulin", "pantoprazole", "omeprazole", "rabeprazole", "esomeprazole",
  // procedure drugs that should never appear on a discharge leaflet uninvited
  "adenosine", "midazolam", "lidocaine",
];
