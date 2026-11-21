// ================== data/chemistryDiagrams.js ==================
// কেমিস্ট্রি ডায়াগ্রাম লাইব্রেরি (১৪০+): শিক্ষক প্রশ্ন বানানোর সময় সার্চ করে ছবি যোগ করেন।
// প্রতিটি এন্ট্রির ফিল্ড:  id, name_en, name_bn, type, smiles, equation   (+ ঐচ্ছিক: conditions, aliases)
//
//  • type: aromatic | alicyclic | heterocyclic | aliphatic | reaction
//  • smiles: অণুর জন্য সাধারণ SMILES (সব রিং কেকুলে রূপে লেখা — বিকল্প দ্বিবন্ধনসহ হেক্সাগন আঁকা হয়)।
//            বিক্রিয়ার জন্য  "বিক্রিয়ক>>উৎপাদ"  (একাধিক অণু '.' দিয়ে আলাদা)। বিকারক/শর্ত তীরের ওপর-নিচে বসে।
//  • equation: অণুর ক্ষেত্রে আণবিক সংকেত, বিক্রিয়ার ক্ষেত্রে সমীকরণ (প্লেইন ইউনিকোড — আলাদা LaTeX লাগে না)
//  • conditions: শুধু বিক্রিয়ার জন্য — "তীরের ওপরে | তীরের নিচে"  (যেমন: 'conc. HNO₃ + conc. H₂SO₄ | 50–60 °C')
//  • aliases: ইংরেজি/বাংলা বানান-বৈচিত্র্য ও বাংলিশ (যেমন benjin → benzene), যাতে সার্চে পাওয়া যায়
//
// নতুন ডায়াগ্রাম যোগ করতে নিচের তালিকায় mol(...) বা rxn(...) এর একটি লাইন যোগ করলেই হবে।

const split = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

const mol = (id, name_en, name_bn, type, smiles, equation, aliases = '') => ({
  id, name_en, name_bn, type, smiles, equation, aliases: split(aliases),
});

const rxn = (id, name_en, name_bn, smiles, conditions, equation, aliases = '') => ({
  id, name_en, name_bn, type: 'reaction', smiles, conditions, equation, aliases: split(aliases),
});

export const TYPE_LABELS = {
  aromatic: { en: 'Aromatic', bn: 'অ্যারোমেটিক' },
  alicyclic: { en: 'Alicyclic', bn: 'অ্যালিসাইক্লিক' },
  heterocyclic: { en: 'Heterocyclic', bn: 'হেটারোসাইক্লিক' },
  aliphatic: { en: 'Aliphatic', bn: 'অ্যালিফেটিক' },
  reaction: { en: 'Reactions', bn: 'বিক্রিয়া' },
};
export const TYPE_ORDER = ['aromatic', 'heterocyclic', 'reaction', 'alicyclic', 'aliphatic'];

const NO2 = '[N+](=O)[O-]';

// ------------------------------------------------------------------ অ্যারোমেটিক
const aromatic = [
  mol('benzene', 'Benzene', 'বেনজিন', 'aromatic', 'C1=CC=CC=C1', 'C₆H₆', 'benzin, benjin, benzine, benjeen, benjene, বেঞ্জিন, বেনজীন'),
  mol('toluene', 'Toluene', 'টলুইন', 'aromatic', 'CC1=CC=CC=C1', 'C₆H₅CH₃', 'toluin, toluen, methylbenzene, মিথাইলবেনজিন, টলিন'),
  mol('o-xylene', 'o-Xylene', 'o-জাইলিন', 'aromatic', 'CC1=CC=CC=C1C', 'C₆H₄(CH₃)₂', 'ortho xylene, 1,2-dimethylbenzene, xylene, জাইলিন, জাইলেন'),
  mol('m-xylene', 'm-Xylene', 'm-জাইলিন', 'aromatic', 'CC1=CC(C)=CC=C1', 'C₆H₄(CH₃)₂', 'meta xylene, 1,3-dimethylbenzene, xylene, জাইলিন, জাইলেন'),
  mol('p-xylene', 'p-Xylene', 'p-জাইলিন', 'aromatic', 'CC1=CC=C(C)C=C1', 'C₆H₄(CH₃)₂', 'para xylene, 1,4-dimethylbenzene, xylene, জাইলিন, জাইলেন'),
  mol('phenol', 'Phenol', 'ফেনল', 'aromatic', 'OC1=CC=CC=C1', 'C₆H₅OH', 'fenol, carbolic acid, hydroxybenzene, ফেনোল, কার্বলিক এসিড'),
  mol('aniline', 'Aniline', 'অ্যানিলিন', 'aromatic', 'NC1=CC=CC=C1', 'C₆H₅NH₂', 'anilin, aminobenzene, phenylamine, এনিলিন, অ্যানিলীন'),
  mol('nitrobenzene', 'Nitrobenzene', 'নাইট্রোবেনজিন', 'aromatic', '[O-][N+](=O)C1=CC=CC=C1', 'C₆H₅NO₂', 'nitrobenjin, nitrobenzin, নাইট্রোবেঞ্জিন'),
  mol('benzoic-acid', 'Benzoic acid', 'বেনজোয়িক এসিড', 'aromatic', 'OC(=O)C1=CC=CC=C1', 'C₆H₅COOH', 'benzoic, benjoic acid, বেনজোইক এসিড, বেঞ্জোয়িক এসিড, বেনজয়িক এসিড'),
  mol('naphthalene', 'Naphthalene', 'ন্যাফথালিন', 'aromatic', 'C1=CC=C2C=CC=CC2=C1', 'C₁₀H₈', 'naphthalin, naphthaline, naftalin, ন্যাপথালিন, ন্যাপথলিন, নেপথালিন'),
  mol('anthracene', 'Anthracene', 'অ্যানথ্রাসিন', 'aromatic', 'C1=CC=C2C=C3C=CC=CC3=CC2=C1', 'C₁₄H₁₀', 'anthracin, anthrasin, এনথ্রাসিন, অ্যান্থ্রাসিন'),
  mol('phenanthrene', 'Phenanthrene', 'ফেনান্থ্রিন', 'aromatic', 'C1=CC=C2C(=C1)C=CC3=CC=CC=C32', 'C₁₄H₁₀', 'phenanthren, fenanthrin, ফেনানথ্রিন'),
  mol('styrene', 'Styrene', 'স্টাইরিন', 'aromatic', 'C=CC1=CC=CC=C1', 'C₆H₅CH=CH₂', 'vinylbenzene, styrin, স্টাইরীন, স্টাইরেন'),
  mol('benzaldehyde', 'Benzaldehyde', 'বেনজালডিহাইড', 'aromatic', 'O=CC1=CC=CC=C1', 'C₆H₅CHO', 'benjaldehyde, benzaldehyd, বেঞ্জালডিহাইড, বেনজ্যালডিহাইড'),
  mol('acetophenone', 'Acetophenone', 'অ্যাসিটোফেনোন', 'aromatic', 'CC(=O)C1=CC=CC=C1', 'C₆H₅COCH₃', 'acetofenon, acetophenon, অ্যাসিটোফিনোন, মিথাইল ফেনাইল কিটোন'),
  mol('benzyl-alcohol', 'Benzyl alcohol', 'বেনজাইল অ্যালকোহল', 'aromatic', 'OCC1=CC=CC=C1', 'C₆H₅CH₂OH', 'benzyl alchohol, benjil alcohol, বেঞ্জাইল অ্যালকোহল'),
  mol('benzonitrile', 'Benzonitrile', 'বেনজোনাইট্রাইল', 'aromatic', 'N#CC1=CC=CC=C1', 'C₆H₅CN', 'phenyl cyanide, benzonitril, বেনজোনাইট্রিল'),
  mol('benzamide', 'Benzamide', 'বেনজামাইড', 'aromatic', 'NC(=O)C1=CC=CC=C1', 'C₆H₅CONH₂', 'benjamide, বেঞ্জামাইড'),
  mol('chlorobenzene', 'Chlorobenzene', 'ক্লোরোবেনজিন', 'aromatic', 'ClC1=CC=CC=C1', 'C₆H₅Cl', 'chlorobenjin, phenyl chloride, ক্লোরোবেঞ্জিন'),
  mol('bromobenzene', 'Bromobenzene', 'ব্রোমোবেনজিন', 'aromatic', 'BrC1=CC=CC=C1', 'C₆H₅Br', 'bromobenjin, phenyl bromide, ব্রোমোবেঞ্জিন'),
  mol('iodobenzene', 'Iodobenzene', 'আয়োডোবেনজিন', 'aromatic', 'IC1=CC=CC=C1', 'C₆H₅I', 'iodobenjin, phenyl iodide, আইওডোবেনজিন'),
  mol('fluorobenzene', 'Fluorobenzene', 'ফ্লুরোবেনজিন', 'aromatic', 'FC1=CC=CC=C1', 'C₆H₅F', 'fluorobenjin, flurobenzene, ফ্লোরোবেনজিন'),
  mol('benzenesulfonic-acid', 'Benzenesulfonic acid', 'বেনজিন সালফোনিক এসিড', 'aromatic', 'OS(=O)(=O)C1=CC=CC=C1', 'C₆H₅SO₃H', 'benzene sulphonic acid, benzene sulfonic acid, benjin sulfonic acid, সালফোনিক এসিড'),
  mol('cumene', 'Cumene', 'কিউমিন', 'aromatic', 'CC(C)C1=CC=CC=C1', 'C₆H₅CH(CH₃)₂', 'isopropylbenzene, cumen, কিউমেন, আইসোপ্রোপাইলবেনজিন'),
  mol('ethylbenzene', 'Ethylbenzene', 'ইথাইলবেনজিন', 'aromatic', 'CCC1=CC=CC=C1', 'C₆H₅C₂H₅', 'ethylbenjin, ethyl benzene, ইথাইল বেনজিন'),
  mol('biphenyl', 'Biphenyl', 'বাইফেনাইল', 'aromatic', 'C1=CC=C(C=C1)C2=CC=CC=C2', 'C₁₂H₁₀', 'diphenyl, bifenyl, ডাইফেনাইল'),
  mol('o-cresol', 'o-Cresol', 'o-ক্রেসল', 'aromatic', 'CC1=CC=CC=C1O', 'CH₃C₆H₄OH', 'ortho cresol, cresol, 2-methylphenol, ক্রেসোল'),
  mol('m-cresol', 'm-Cresol', 'm-ক্রেসল', 'aromatic', 'CC1=CC(O)=CC=C1', 'CH₃C₆H₄OH', 'meta cresol, cresol, 3-methylphenol, ক্রেসোল'),
  mol('p-cresol', 'p-Cresol', 'p-ক্রেসল', 'aromatic', 'CC1=CC=C(O)C=C1', 'CH₃C₆H₄OH', 'para cresol, cresol, 4-methylphenol, ক্রেসোল'),
  mol('catechol', 'Catechol', 'ক্যাটেকল', 'aromatic', 'OC1=CC=CC=C1O', 'C₆H₄(OH)₂', 'pyrocatechol, 1,2-dihydroxybenzene, catechin, ক্যাটিকল, পাইরোক্যাটেকল'),
  mol('resorcinol', 'Resorcinol', 'রিসরসিনল', 'aromatic', 'OC1=CC(O)=CC=C1', 'C₆H₄(OH)₂', 'resorcin, 1,3-dihydroxybenzene, রেসরসিনল'),
  mol('hydroquinone', 'Hydroquinone', 'হাইড্রোকুইনোন', 'aromatic', 'OC1=CC=C(O)C=C1', 'C₆H₄(OH)₂', 'quinol, 1,4-dihydroxybenzene, hydroquinon, হাইড্রোকুইনন'),
  mol('salicylic-acid', 'Salicylic acid', 'স্যালিসাইলিক এসিড', 'aromatic', 'OC(=O)C1=CC=CC=C1O', 'C₇H₆O₃', 'o-hydroxybenzoic acid, salisilic acid, সেলিসাইলিক এসিড'),
  mol('aspirin', 'Aspirin', 'অ্যাসপিরিন', 'aromatic', 'CC(=O)OC1=CC=CC=C1C(O)=O', 'C₉H₈O₄', 'acetylsalicylic acid, aspirin, এসপিরিন, অ্যাস্পিরিন'),
  mol('picric-acid', 'Picric acid', 'পিক্রিক এসিড', 'aromatic', `OC1=C(${NO2})C=C(${NO2})C=C1${NO2}`, 'C₆H₂(NO₂)₃OH', '2,4,6-trinitrophenol, pikrik acid, পিকরিক এসিড'),
  mol('tnt', 'TNT (Trinitrotoluene)', 'টিএনটি (ট্রাইনাইট্রোটলুইন)', 'aromatic', `CC1=C(${NO2})C=C(${NO2})C=C1${NO2}`, 'C₆H₂(NO₂)₃CH₃', 'trinitrotoluene, 2,4,6-trinitrotoluene, TNT, ট্রাইনাইট্রোটলুইন'),
  mol('m-dinitrobenzene', 'm-Dinitrobenzene', 'm-ডাইনাইট্রোবেনজিন', 'aromatic', `[O-][N+](=O)C1=CC=CC(${NO2})=C1`, 'C₆H₄(NO₂)₂', 'meta dinitrobenzene, 1,3-dinitrobenzene, dinitrobenjin, ডাইনাইট্রোবেঞ্জিন'),
  mol('p-nitrophenol', 'p-Nitrophenol', 'p-নাইট্রোফেনল', 'aromatic', `OC1=CC=C(${NO2})C=C1`, 'HOC₆H₄NO₂', 'para nitrophenol, 4-nitrophenol, nitrofenol, নাইট্রোফেনোল'),
  mol('p-nitroaniline', 'p-Nitroaniline', 'p-নাইট্রোঅ্যানিলিন', 'aromatic', `NC1=CC=C(${NO2})C=C1`, 'H₂NC₆H₄NO₂', 'para nitroaniline, 4-nitroaniline, নাইট্রোএনিলিন'),
  mol('acetanilide', 'Acetanilide', 'অ্যাসিটানিলাইড', 'aromatic', 'CC(=O)NC1=CC=CC=C1', 'C₆H₅NHCOCH₃', 'acetanilid, N-phenylacetamide, এসিটানিলাইড'),
  mol('benzenediazonium', 'Benzenediazonium ion', 'বেনজিন ডায়াজোনিয়াম আয়ন', 'aromatic', '[N+](#N)C1=CC=CC=C1', 'C₆H₅N₂⁺ Cl⁻', 'diazonium, benzene diazonium chloride, benjin diazonium, ডায়াজোনিয়াম ক্লোরাইড'),
  mol('sulfanilic-acid', 'Sulfanilic acid', 'সালফানিলিক এসিড', 'aromatic', 'NC1=CC=C(C=C1)S(O)(=O)=O', 'H₂NC₆H₄SO₃H', 'sulphanilic acid, 4-aminobenzenesulfonic acid, সালফেনিলিক এসিড'),
  mol('benzyl-chloride', 'Benzyl chloride', 'বেনজাইল ক্লোরাইড', 'aromatic', 'ClCC1=CC=CC=C1', 'C₆H₅CH₂Cl', 'benjil chloride, বেঞ্জাইল ক্লোরাইড'),
  mol('anisole', 'Anisole', 'অ্যানিসোল', 'aromatic', 'COC1=CC=CC=C1', 'C₆H₅OCH₃', 'methoxybenzene, methyl phenyl ether, এনিসোল'),
  mol('benzophenone', 'Benzophenone', 'বেনজোফেনোন', 'aromatic', 'O=C(C1=CC=CC=C1)C1=CC=CC=C1', 'C₆H₅COC₆H₅', 'diphenyl ketone, benjofenon, বেঞ্জোফেনোন'),
  mol('phthalic-acid', 'Phthalic acid', 'থ্যালিক এসিড', 'aromatic', 'OC(=O)C1=CC=CC=C1C(O)=O', 'C₆H₄(COOH)₂', 'phthalic, o-phthalic acid, ফথালিক এসিড, থ্যালিক'),
  mol('terephthalic-acid', 'Terephthalic acid', 'টেরেফথ্যালিক এসিড', 'aromatic', 'OC(=O)C1=CC=C(C=C1)C(O)=O', 'C₆H₄(COOH)₂', 'terephthalic, p-phthalic acid, টেরেফথালিক এসিড'),
  mol('azobenzene', 'Azobenzene', 'অ্যাজোবেনজিন', 'aromatic', 'C1=CC=C(C=C1)N=NC2=CC=CC=C2', 'C₆H₅N=NC₆H₅', 'azobenjin, azo benzene, এজোবেনজিন'),
  mol('dimethylaniline', 'N,N-Dimethylaniline', 'N,N-ডাইমিথাইলঅ্যানিলিন', 'aromatic', 'CN(C)C1=CC=CC=C1', 'C₆H₅N(CH₃)₂', 'dimethyl aniline, dimethylanilin, ডাইমিথাইল অ্যানিলিন'),
  mol('diphenylamine', 'Diphenylamine', 'ডাইফেনাইলঅ্যামিন', 'aromatic', 'C1=CC=C(C=C1)NC2=CC=CC=C2', '(C₆H₅)₂NH', 'diphenyl amine, ডাইফেনাইল অ্যামিন'),
  mol('phenylhydrazine', 'Phenylhydrazine', 'ফেনাইলহাইড্রাজিন', 'aromatic', 'NNC1=CC=CC=C1', 'C₆H₅NHNH₂', 'phenyl hydrazine, fenilhydrazin, ফেনিলহাইড্রাজিন'),
  mol('benzoyl-chloride', 'Benzoyl chloride', 'বেনজয়ল ক্লোরাইড', 'aromatic', 'ClC(=O)C1=CC=CC=C1', 'C₆H₅COCl', 'benjoyl chloride, বেঞ্জয়ল ক্লোরাইড'),
  mol('vanillin', 'Vanillin', 'ভ্যানিলিন', 'aromatic', 'O=CC1=CC=C(O)C(OC)=C1', 'C₈H₈O₃', 'vanilin, vanila, ভ্যানিলা'),
];

// ------------------------------------------------------------------ অ্যালিসাইক্লিক
const alicyclic = [
  mol('cyclopropane', 'Cyclopropane', 'সাইক্লোপ্রোপেন', 'alicyclic', 'C1CC1', 'C₃H₆', 'cyclo propane, সাইক্লো প্রোপেন'),
  mol('cyclobutane', 'Cyclobutane', 'সাইক্লোবিউটেন', 'alicyclic', 'C1CCC1', 'C₄H₈', 'cyclo butane, সাইক্লোবিউটেন'),
  mol('cyclopentane', 'Cyclopentane', 'সাইক্লোপেন্টেন', 'alicyclic', 'C1CCCC1', 'C₅H₁₀', 'cyclo pentane'),
  mol('cyclohexane', 'Cyclohexane', 'সাইক্লোহেক্সেন', 'alicyclic', 'C1CCCCC1', 'C₆H₁₂', 'cyclo hexane, cyclohexen, সাইক্লোহেক্সান'),
  mol('cyclohexene', 'Cyclohexene', 'সাইক্লোহেক্সিন', 'alicyclic', 'C1=CCCCC1', 'C₆H₁₀', 'cyclo hexene, সাইক্লোহেক্সিন'),
  mol('cyclohexanol', 'Cyclohexanol', 'সাইক্লোহেক্সানল', 'alicyclic', 'OC1CCCCC1', 'C₆H₁₁OH', 'cyclo hexanol, সাইক্লোহেক্সানোল'),
  mol('cyclohexanone', 'Cyclohexanone', 'সাইক্লোহেক্সানোন', 'alicyclic', 'O=C1CCCCC1', 'C₆H₁₀O', 'cyclo hexanone, সাইক্লোহেক্সানন'),
];

// ------------------------------------------------------------------ হেটারোসাইক্লিক
const heterocyclic = [
  mol('pyridine', 'Pyridine', 'পিরিডিন', 'heterocyclic', 'C1=CC=NC=C1', 'C₅H₅N', 'piridin, pyridin, পাইরিডিন, পিরিডীন'),
  mol('pyrrole', 'Pyrrole', 'পাইরোল', 'heterocyclic', 'C1=CNC=C1', 'C₄H₅N', 'pirol, pyrol, পিরোল, পাইরল'),
  mol('furan', 'Furan', 'ফিউরান', 'heterocyclic', 'C1=COC=C1', 'C₄H₄O', 'furon, fiuran, ফুরান'),
  mol('thiophene', 'Thiophene', 'থায়োফিন', 'heterocyclic', 'C1=CSC=C1', 'C₄H₄S', 'thiofin, tiophene, thiophin, থিওফিন, থায়োফেন'),
  mol('imidazole', 'Imidazole', 'ইমিডাজোল', 'heterocyclic', 'C1=CN=CN1', 'C₃H₄N₂', 'imidazol, imidazole, ইমিডাজল'),
  mol('pyrimidine', 'Pyrimidine', 'পিরিমিডিন', 'heterocyclic', 'C1=CN=CN=C1', 'C₄H₄N₂', 'pirimidin, pyrimidin, পাইরিমিডিন'),
  mol('pyrazine', 'Pyrazine', 'পাইরাজিন', 'heterocyclic', 'C1=CN=CC=N1', 'C₄H₄N₂', 'pirazin, pyrazin, পিরাজিন'),
  mol('pyridazine', 'Pyridazine', 'পিরিডাজিন', 'heterocyclic', 'C1=CC=NN=C1', 'C₄H₄N₂', 'piridazin, pyridazin, পাইরিডাজিন'),
  mol('indole', 'Indole', 'ইন্ডোল', 'heterocyclic', 'C1=CC2=CC=CC=C2N1', 'C₈H₇N', 'indol, indoll, ইন্ডল'),
  mol('quinoline', 'Quinoline', 'কুইনোলিন', 'heterocyclic', 'C1=CC=C2C(=C1)C=CC=N2', 'C₉H₇N', 'quinolin, kwinolin, কুইনলিন'),
  mol('isoquinoline', 'Isoquinoline', 'আইসোকুইনোলিন', 'heterocyclic', 'C1=CC=C2C=NC=CC2=C1', 'C₉H₇N', 'isoquinolin, iso quinoline, আইসোকুইনলিন'),
  mol('purine', 'Purine', 'পিউরিন', 'heterocyclic', 'C1=NC2=C(N1)N=CN=C2', 'C₅H₄N₄', 'purin, পিউরীন'),
  mol('thiazole', 'Thiazole', 'থায়াজোল', 'heterocyclic', 'C1=CSC=N1', 'C₃H₃NS', 'thiazol, tiazole, থিয়াজোল'),
  mol('oxazole', 'Oxazole', 'অক্সাজোল', 'heterocyclic', 'C1=COC=N1', 'C₃H₃NO', 'oxazol, oksazole, অক্সাজল'),
  mol('pyrazole', 'Pyrazole', 'পাইরাজোল', 'heterocyclic', 'C1=CNN=C1', 'C₃H₄N₂', 'pirazole, pyrazol, পিরাজোল'),
  mol('benzofuran', 'Benzofuran', 'বেনজোফিউরান', 'heterocyclic', 'C1=CC2=CC=CC=C2O1', 'C₈H₆O', 'benjofuran, benzo furan, বেঞ্জোফিউরান'),
  mol('benzothiophene', 'Benzothiophene', 'বেনজোথায়োফিন', 'heterocyclic', 'C1=CC2=CC=CC=C2S1', 'C₈H₆S', 'benjothiophene, benzo thiophene, বেঞ্জোথায়োফিন'),
  mol('benzimidazole', 'Benzimidazole', 'বেনজিমিডাজোল', 'heterocyclic', 'C1=CC=C2C(=C1)NC=N2', 'C₇H₆N₂', 'benjimidazole, benz imidazole, বেঞ্জিমিডাজোল'),
  mol('piperidine', 'Piperidine', 'পিপারিডিন', 'heterocyclic', 'C1CCNCC1', 'C₅H₁₁N', 'piperidin, piperidene, পাইপেরিডিন'),
  mol('pyrrolidine', 'Pyrrolidine', 'পাইরোলিডিন', 'heterocyclic', 'C1CCNC1', 'C₄H₉N', 'pirolidin, pyrrolidin, পিরোলিডিন'),
  mol('morpholine', 'Morpholine', 'মরফোলিন', 'heterocyclic', 'C1COCCN1', 'C₄H₉NO', 'morpholin, morfolin, মর্ফোলিন'),
  mol('thf', 'Tetrahydrofuran (THF)', 'টেট্রাহাইড্রোফিউরান (THF)', 'heterocyclic', 'C1CCOC1', 'C₄H₈O', 'THF, tetra hydro furan, tetrahydrofuran, টেট্রাহাইড্রোফুরান'),
  mol('dioxane', '1,4-Dioxane', '১,৪-ডাইঅক্সেন', 'heterocyclic', 'C1COCCO1', 'C₄H₈O₂', 'dioxan, 1,4 dioxane, dioxene, ডাইঅক্সান'),
  mol('caffeine', 'Caffeine', 'ক্যাফেইন', 'heterocyclic', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C', 'C₈H₁₀N₄O₂', 'caffein, cafein, ক্যাফিন, কেফেইন'),
  mol('nicotine', 'Nicotine', 'নিকোটিন', 'heterocyclic', 'CN1CCCC1C1=CN=CC=C1', 'C₁₀H₁₄N₂', 'nicotin, nikotin, নিকোটীন'),
  mol('adenine', 'Adenine', 'অ্যাডেনিন', 'heterocyclic', 'NC1=NC=NC2=C1NC=N2', 'C₅H₅N₅', 'adenin, edenin, এডেনিন'),
  mol('guanine', 'Guanine', 'গুয়ানিন', 'heterocyclic', 'C1=NC2=C(N1)C(=O)NC(=N2)N', 'C₅H₅N₅O', 'guanin, guanine, গুয়ানীন, গুয়ানাইন'),
  mol('cytosine', 'Cytosine', 'সাইটোসিন', 'heterocyclic', 'NC1=NC(=O)NC=C1', 'C₄H₅N₃O', 'cytosin, sitosin, সাইটোসীন'),
  mol('uracil', 'Uracil', 'ইউরাসিল', 'heterocyclic', 'O=C1C=CNC(=O)N1', 'C₄H₄N₂O₂', 'uracil, urasil, ইউরেসিল'),
  mol('thymine', 'Thymine', 'থাইমিন', 'heterocyclic', 'CC1=CNC(=O)NC1=O', 'C₅H₆N₂O₂', 'thymin, timin, থায়ামিন'),
];

// ------------------------------------------------------------------ অ্যালিফেটিক (সাধারণ কিছু)
const aliphatic = [
  mol('ethene', 'Ethene (Ethylene)', 'ইথিন (ইথিলিন)', 'aliphatic', 'C=C', 'CH₂=CH₂', 'ethylene, ethen, ইথিলিন, ইথেন'),
  mol('ethyne', 'Ethyne (Acetylene)', 'ইথাইন (অ্যাসিটিলিন)', 'aliphatic', 'C#C', 'HC≡CH', 'acetylene, ethyne, ethyn, এসিটিলিন, ইথাইন'),
  mol('methanol', 'Methanol', 'মিথানল', 'aliphatic', 'CO', 'CH₃OH', 'methyl alcohol, methanol, মিথাইল অ্যালকোহল'),
  mol('ethanol', 'Ethanol', 'ইথানল', 'aliphatic', 'CCO', 'C₂H₅OH', 'ethyl alcohol, alcohol, ইথাইল অ্যালকোহল, এথানল'),
  mol('acetic-acid', 'Acetic acid', 'অ্যাসিটিক এসিড', 'aliphatic', 'CC(O)=O', 'CH₃COOH', 'ethanoic acid, acetic, এসিটিক এসিড, ইথানোয়িক এসিড'),
  mol('acetone', 'Acetone', 'অ্যাসিটোন', 'aliphatic', 'CC(C)=O', 'CH₃COCH₃', 'propanone, dimethyl ketone, এসিটোন, প্রোপানোন'),
  mol('acetaldehyde', 'Acetaldehyde', 'অ্যাসিটালডিহাইড', 'aliphatic', 'CC=O', 'CH₃CHO', 'ethanal, acetaldehyd, এসিটালডিহাইড, ইথানাল'),
  mol('ethyl-acetate', 'Ethyl acetate', 'ইথাইল অ্যাসিটেট', 'aliphatic', 'CCOC(C)=O', 'CH₃COOC₂H₅', 'ethyl ethanoate, ester, এস্টার, ইথাইল এসিটেট'),
  mol('diethyl-ether', 'Diethyl ether', 'ডাইইথাইল ইথার', 'aliphatic', 'CCOCC', 'C₂H₅OC₂H₅', 'ether, ethoxyethane, ইথার, ডাই ইথাইল ইথার'),
  mol('glycine', 'Glycine', 'গ্লাইসিন', 'aliphatic', 'NCC(O)=O', 'NH₂CH₂COOH', 'glycin, amino acid, অ্যামিনো এসিড, গ্লাইসীন'),
  mol('urea', 'Urea', 'ইউরিয়া', 'aliphatic', 'NC(N)=O', 'CO(NH₂)₂', 'carbamide, urea, ইউরিয়া, কার্বামাইড'),
  mol('chloroform', 'Chloroform', 'ক্লোরোফর্ম', 'aliphatic', 'ClC(Cl)Cl', 'CHCl₃', 'trichloromethane, cloroform, ট্রাইক্লোরোমিথেন'),
];

// ------------------------------------------------------------------ বিক্রিয়া
const reactions = [
  // নাইট্রেশন
  rxn('nitration-benzene', 'Nitration of benzene', 'বেনজিনের নাইট্রেশন',
    'C1=CC=CC=C1>>[O-][N+](=O)C1=CC=CC=C1',
    'conc. HNO₃ + conc. H₂SO₄ | 50–60 °C', 'C₆H₆ + HNO₃ → C₆H₅NO₂ + H₂O',
    'nitration, nitreshon, nitration of benjin, electrophilic substitution, নাইট্রেশন, নাইট্রোকরণ, বেঞ্জিনের নাইট্রেশন'),
  rxn('nitration-toluene', 'Nitration of toluene', 'টলুইনের নাইট্রেশন',
    `CC1=CC=CC=C1>>CC1=CC=C(${NO2})C=C1`,
    'conc. HNO₃ + conc. H₂SO₄ | 30 °C', 'C₆H₅CH₃ + HNO₃ → O₂N–C₆H₄–CH₃ + H₂O  (o- ও p-)',
    'nitration, nitreshon, p-nitrotoluene, নাইট্রেশন'),
  rxn('nitration-phenol-dilute', 'Nitration of phenol (dilute HNO₃)', 'ফেনলের নাইট্রেশন (লঘু HNO₃)',
    `OC1=CC=CC=C1>>OC1=CC=C(${NO2})C=C1`,
    'dil. HNO₃ | 298 K', 'C₆H₅OH + HNO₃ → HOC₆H₄NO₂ + H₂O  (o- ও p-)',
    'nitration, nitreshon, p-nitrophenol, নাইট্রেশন'),
  rxn('nitration-phenol-picric', 'Phenol to picric acid (nitration)', 'ফেনল থেকে পিক্রিক এসিড (নাইট্রেশন)',
    `OC1=CC=CC=C1>>OC1=C(${NO2})C=C(${NO2})C=C1${NO2}`,
    'conc. HNO₃ + conc. H₂SO₄ | heat', 'C₆H₅OH + 3HNO₃ → C₆H₂(NO₂)₃OH + 3H₂O',
    'nitration, nitreshon, picric acid preparation, trinitrophenol, নাইট্রেশন, পিকরিক এসিড'),
  rxn('nitration-nitrobenzene', 'Nitration of nitrobenzene', 'নাইট্রোবেনজিনের নাইট্রেশন',
    `[O-][N+](=O)C1=CC=CC=C1>>[O-][N+](=O)C1=CC=CC(${NO2})=C1`,
    'fuming HNO₃ + conc. H₂SO₄ | 100 °C', 'C₆H₅NO₂ + HNO₃ → C₆H₄(NO₂)₂ + H₂O  (m-)',
    'nitration, nitreshon, m-dinitrobenzene, নাইট্রেশন'),
  rxn('nitration-toluene-tnt', 'Toluene to TNT (nitration)', 'টলুইন থেকে টিএনটি (নাইট্রেশন)',
    `CC1=CC=CC=C1>>CC1=C(${NO2})C=C(${NO2})C=C1${NO2}`,
    'conc. HNO₃ + conc. H₂SO₄ | heat', 'C₆H₅CH₃ + 3HNO₃ → C₆H₂(NO₂)₃CH₃ + 3H₂O',
    'nitration, nitreshon, TNT preparation, trinitrotoluene, নাইট্রেশন, টিএনটি'),

  // সালফোনেশন
  rxn('sulfonation-benzene', 'Sulfonation of benzene', 'বেনজিনের সালফোনেশন',
    'C1=CC=CC=C1>>OS(=O)(=O)C1=CC=CC=C1',
    'conc. H₂SO₄ (or oleum) | heat', 'C₆H₆ + H₂SO₄ → C₆H₅SO₃H + H₂O',
    'sulfonation, sulphonation, sulfoneshon, সালফোনেশন, সালফোনিকরণ'),
  rxn('sulfonation-toluene', 'Sulfonation of toluene', 'টলুইনের সালফোনেশন',
    'CC1=CC=CC=C1>>CC1=CC=C(C=C1)S(O)(=O)=O',
    'conc. H₂SO₄ | heat', 'C₆H₅CH₃ + H₂SO₄ → CH₃C₆H₄SO₃H + H₂O',
    'sulfonation, sulphonation, p-toluenesulfonic acid, সালফোনেশন'),
  rxn('sulfonation-aniline', 'Sulfonation of aniline', 'অ্যানিলিনের সালফোনেশন',
    'NC1=CC=CC=C1>>NC1=CC=C(C=C1)S(O)(=O)=O',
    'conc. H₂SO₄ | 180–200 °C', 'C₆H₅NH₂ + H₂SO₄ → H₂NC₆H₄SO₃H + H₂O',
    'sulfonation, sulphonation, sulfanilic acid preparation, সালফোনেশন'),

  // ফ্রিডেল–ক্রাফটস
  rxn('fc-alkylation-methyl', 'Friedel–Crafts alkylation (methylation)', 'ফ্রিডেল-ক্রাফটস অ্যালকাইলেশন (মিথাইলেশন)',
    'C1=CC=CC=C1.CCl>>CC1=CC=CC=C1',
    'anhyd. AlCl₃', 'C₆H₆ + CH₃Cl → C₆H₅CH₃ + HCl',
    'friedel crafts, friedel-crafts, alkylation, toluene preparation, ফ্রিডেল ক্রাফট, ফ্রিডেল ক্রাফটস, অ্যালকাইলেশন'),
  rxn('fc-alkylation-ethyl', 'Friedel–Crafts alkylation (ethylation)', 'ফ্রিডেল-ক্রাফটস অ্যালকাইলেশন (ইথাইলেশন)',
    'C1=CC=CC=C1.CCCl>>CCC1=CC=CC=C1',
    'anhyd. AlCl₃', 'C₆H₆ + C₂H₅Cl → C₆H₅C₂H₅ + HCl',
    'friedel crafts, friedel-crafts, alkylation, ethylbenzene preparation, ফ্রিডেল ক্রাফট, অ্যালকাইলেশন'),
  rxn('fc-alkylation-cumene', 'Friedel–Crafts alkylation (cumene)', 'ফ্রিডেল-ক্রাফটস অ্যালকাইলেশন (কিউমিন)',
    'C1=CC=CC=C1.CC(C)Cl>>CC(C)C1=CC=CC=C1',
    'anhyd. AlCl₃', 'C₆H₆ + (CH₃)₂CHCl → C₆H₅CH(CH₃)₂ + HCl',
    'friedel crafts, friedel-crafts, alkylation, cumene preparation, isopropylbenzene, ফ্রিডেল ক্রাফট, অ্যালকাইলেশন'),
  rxn('fc-acylation-acetyl', 'Friedel–Crafts acylation (acetylation)', 'ফ্রিডেল-ক্রাফটস অ্যাসাইলেশন (অ্যাসিটাইলেশন)',
    'C1=CC=CC=C1.CC(Cl)=O>>CC(=O)C1=CC=CC=C1',
    'anhyd. AlCl₃', 'C₆H₆ + CH₃COCl → C₆H₅COCH₃ + HCl',
    'friedel crafts, friedel-crafts, acylation, acetophenone preparation, ফ্রিডেল ক্রাফট, অ্যাসাইলেশন'),
  rxn('fc-acylation-benzoyl', 'Friedel–Crafts acylation (benzoylation)', 'ফ্রিডেল-ক্রাফটস অ্যাসাইলেশন (বেনজয়লেশন)',
    'C1=CC=CC=C1.ClC(=O)C1=CC=CC=C1>>O=C(C1=CC=CC=C1)C1=CC=CC=C1',
    'anhyd. AlCl₃', 'C₆H₆ + C₆H₅COCl → C₆H₅COC₆H₅ + HCl',
    'friedel crafts, friedel-crafts, acylation, benzophenone preparation, ফ্রিডেল ক্রাফট, অ্যাসাইলেশন'),

  // হ্যালোজেনেশন
  rxn('halogenation-chlorination-benzene', 'Chlorination of benzene', 'বেনজিনের ক্লোরিনেশন',
    'C1=CC=CC=C1>>ClC1=CC=CC=C1',
    'Cl₂ | anhyd. FeCl₃ (or AlCl₃)', 'C₆H₆ + Cl₂ → C₆H₅Cl + HCl',
    'halogenation, chlorination, halojeneshon, হ্যালোজেনেশন, ক্লোরিনেশন'),
  rxn('halogenation-bromination-benzene', 'Bromination of benzene', 'বেনজিনের ব্রোমিনেশন',
    'C1=CC=CC=C1>>BrC1=CC=CC=C1',
    'Br₂ | FeBr₃', 'C₆H₆ + Br₂ → C₆H₅Br + HBr',
    'halogenation, bromination, halojeneshon, হ্যালোজেনেশন, ব্রোমিনেশন'),
  rxn('halogenation-bromination-toluene', 'Ring bromination of toluene', 'টলুইনের ব্রোমিনেশন (রিং)',
    'CC1=CC=CC=C1>>CC1=CC=C(Br)C=C1',
    'Br₂ | FeBr₃, dark', 'C₆H₅CH₃ + Br₂ → BrC₆H₄CH₃ + HBr  (o- ও p-)',
    'halogenation, bromination, p-bromotoluene, হ্যালোজেনেশন, ব্রোমিনেশন'),
  rxn('halogenation-side-chain-toluene', 'Side-chain chlorination of toluene', 'টলুইনের পার্শ্বশৃঙ্খলে ক্লোরিনেশন',
    'CC1=CC=CC=C1>>ClCC1=CC=CC=C1',
    'Cl₂ | UV light / boiling', 'C₆H₅CH₃ + Cl₂ → C₆H₅CH₂Cl + HCl',
    'halogenation, chlorination, benzyl chloride preparation, free radical, হ্যালোজেনেশন, ক্লোরিনেশন'),
  rxn('halogenation-bromination-phenol', 'Bromination of phenol (bromine water)', 'ফেনলের ব্রোমিনেশন (ব্রোমিন পানি)',
    'OC1=CC=CC=C1>>OC1=C(Br)C=C(Br)C=C1Br',
    'Br₂ / H₂O (bromine water)', 'C₆H₅OH + 3Br₂ → C₆H₂Br₃OH + 3HBr',
    'halogenation, bromination, 2,4,6-tribromophenol, হ্যালোজেনেশন, ব্রোমিনেশন'),
  rxn('halogenation-bromination-aniline', 'Bromination of aniline (bromine water)', 'অ্যানিলিনের ব্রোমিনেশন (ব্রোমিন পানি)',
    'NC1=CC=CC=C1>>NC1=C(Br)C=C(Br)C=C1Br',
    'Br₂ / H₂O (bromine water)', 'C₆H₅NH₂ + 3Br₂ → C₆H₂Br₃NH₂ + 3HBr',
    'halogenation, bromination, 2,4,6-tribromoaniline, হ্যালোজেনেশন, ব্রোমিনেশন'),
  rxn('halogenation-bhc', 'Addition of chlorine to benzene (BHC)', 'বেনজিনে ক্লোরিন যোগ (BHC)',
    'C1=CC=CC=C1>>ClC1C(Cl)C(Cl)C(Cl)C(Cl)C1Cl',
    'Cl₂ (excess) | UV light', 'C₆H₆ + 3Cl₂ → C₆H₆Cl₆',
    'halogenation, chlorination, addition, benzene hexachloride, gammexane, lindane, হ্যালোজেনেশন, গ্যামাক্সিন'),

  // হাইড্রোজেনেশন
  rxn('hydrogenation-benzene', 'Hydrogenation of benzene', 'বেনজিনের হাইড্রোজেনেশন',
    'C1=CC=CC=C1>>C1CCCCC1',
    'H₂ | Ni, 150–200 °C', 'C₆H₆ + 3H₂ → C₆H₁₂',
    'hydrogenation, haidrogenation, hydrojeneshon, reduction, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-ethene', 'Hydrogenation of ethene', 'ইথিনের হাইড্রোজেনেশন',
    'C=C>>CC',
    'H₂ | Ni / Pt / Pd', 'CH₂=CH₂ + H₂ → CH₃–CH₃',
    'hydrogenation, haidrogenation, sabatier senderens, ethylene, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-ethyne-partial', 'Partial hydrogenation of ethyne (Lindlar)', 'ইথাইনের আংশিক হাইড্রোজেনেশন (লিন্ডলার)',
    'C#C>>C=C',
    'H₂ | Lindlar catalyst (Pd/BaSO₄)', 'HC≡CH + H₂ → CH₂=CH₂',
    'hydrogenation, haidrogenation, acetylene, lindlar, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-ethyne-full', 'Complete hydrogenation of ethyne', 'ইথাইনের পূর্ণ হাইড্রোজেনেশন',
    'C#C>>CC',
    'excess H₂ | Ni, heat', 'HC≡CH + 2H₂ → CH₃–CH₃',
    'hydrogenation, haidrogenation, acetylene, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-cyclohexene', 'Hydrogenation of cyclohexene', 'সাইক্লোহেক্সিনের হাইড্রোজেনেশন',
    'C1=CCCCC1>>C1CCCCC1',
    'H₂ | Ni', 'C₆H₁₀ + H₂ → C₆H₁₂',
    'hydrogenation, haidrogenation, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-phenol', 'Hydrogenation of phenol', 'ফেনলের হাইড্রোজেনেশন',
    'OC1=CC=CC=C1>>OC1CCCCC1',
    'H₂ | Ni, 150 °C', 'C₆H₅OH + 3H₂ → C₆H₁₁OH',
    'hydrogenation, haidrogenation, cyclohexanol preparation, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-naphthalene', 'Hydrogenation of naphthalene (tetralin)', 'ন্যাফথালিনের হাইড্রোজেনেশন (টেট্রালিন)',
    'C1=CC=C2C=CC=CC2=C1>>C1=CC=C2CCCCC2=C1',
    'H₂ | Ni (partial)', 'C₁₀H₈ + 2H₂ → C₁₀H₁₂',
    'hydrogenation, haidrogenation, tetralin, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-acetone', 'Hydrogenation of acetone', 'অ্যাসিটোনের হাইড্রোজেনেশন',
    'CC(C)=O>>CC(C)O',
    'H₂ | Ni', 'CH₃COCH₃ + H₂ → (CH₃)₂CHOH',
    'hydrogenation, haidrogenation, isopropanol, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('hydrogenation-benzaldehyde', 'Hydrogenation of benzaldehyde', 'বেনজালডিহাইডের হাইড্রোজেনেশন',
    'O=CC1=CC=CC=C1>>OCC1=CC=CC=C1',
    'H₂ | Ni', 'C₆H₅CHO + H₂ → C₆H₅CH₂OH',
    'hydrogenation, haidrogenation, benzyl alcohol, হাইড্রোজেনেশন, হাইড্রোজিনেশন'),
  rxn('reduction-nitrobenzene', 'Reduction of nitrobenzene', 'নাইট্রোবেনজিনের বিজারণ',
    '[O-][N+](=O)C1=CC=CC=C1>>NC1=CC=CC=C1',
    'H₂ | Ni  (or Sn / conc. HCl)', 'C₆H₅NO₂ + 3H₂ → C₆H₅NH₂ + 2H₂O',
    'hydrogenation, haidrogenation, aniline preparation, reduction, হাইড্রোজেনেশন, বিজারণ'),

  // অন্যান্য গুরুত্বপূর্ণ বিক্রিয়া
  rxn('kolbe-reaction', "Kolbe's reaction (phenol to salicylic acid)", 'কোলবে বিক্রিয়া (ফেনল থেকে স্যালিসাইলিক এসিড)',
    'OC1=CC=CC=C1>>OC(=O)C1=CC=CC=C1O',
    'i) NaOH ii) CO₂, 400 K, 4–7 atm iii) H⁺', 'C₆H₅ONa + CO₂ → o-HOC₆H₄COONa →(H⁺) o-HOC₆H₄COOH',
    'kolbe, kolbey, kolbe schmitt, salicylic acid preparation, কলবে, কোলবে'),
  rxn('reimer-tiemann', 'Reimer–Tiemann reaction', 'রাইমার–টিম্যান বিক্রিয়া',
    'OC1=CC=CC=C1>>O=CC1=CC=CC=C1O',
    'CHCl₃ + aq. NaOH | 340 K', 'C₆H₅OH + CHCl₃ + 3NaOH → o-HOC₆H₄CHO + 3NaCl + 2H₂O',
    'reimer tiemann, riemer, salicylaldehyde, রাইমার টিমান, রাইমার-টাইম্যান'),
  rxn('oxidation-toluene', 'Oxidation of toluene to benzoic acid', 'টলুইনের জারণ (বেনজোয়িক এসিড)',
    'CC1=CC=CC=C1>>OC(=O)C1=CC=CC=C1',
    'KMnO₄ / H⁺ (or alk. KMnO₄) | heat', 'C₆H₅CH₃ + 3[O] → C₆H₅COOH + H₂O',
    'oxidation, benzoic acid preparation, side chain oxidation, জারণ'),
  rxn('diazotisation-aniline', 'Diazotisation of aniline', 'অ্যানিলিনের ডায়াজোটাইজেশন',
    'NC1=CC=CC=C1>>[N+](#N)C1=CC=CC=C1',
    'NaNO₂ + HCl | 273–278 K (0–5 °C)', 'C₆H₅NH₂ + NaNO₂ + 2HCl → C₆H₅N₂⁺Cl⁻ + NaCl + 2H₂O',
    'diazotization, diazotisation, diazonium salt, ডায়াজোটাইজেশন, ডায়াজোকরণ'),
  rxn('sandmeyer-reaction', 'Sandmeyer reaction (chlorobenzene)', 'স্যান্ডমেয়ার বিক্রিয়া (ক্লোরোবেনজিন)',
    '[N+](#N)C1=CC=CC=C1>>ClC1=CC=CC=C1',
    'CuCl / HCl', 'C₆H₅N₂⁺Cl⁻ → C₆H₅Cl + N₂',
    'sandmeyer, sandmayer, diazonium, স্যান্ডমেয়ার, সেন্ডমেয়ার'),
  rxn('esterification', 'Esterification (ethyl acetate)', 'এস্টারিফিকেশন (ইথাইল অ্যাসিটেট)',
    'CC(O)=O.CCO>>CCOC(C)=O',
    'conc. H₂SO₄ | heat', 'CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O',
    'esterification, ester, esterification, এস্টারকরণ, এস্টার'),
  rxn('aspirin-synthesis', 'Synthesis of aspirin', 'অ্যাসপিরিন প্রস্তুতি',
    'OC(=O)C1=CC=CC=C1O.CC(=O)OC(C)=O>>CC(=O)OC1=CC=CC=C1C(O)=O',
    'H₂SO₄ (cat.) | 340 K', 'C₇H₆O₃ + (CH₃CO)₂O → C₉H₈O₄ + CH₃COOH',
    'aspirin, acetylation, acetylsalicylic acid, acetic anhydride, এসপিরিন, অ্যাসিটাইলেশন'),
  rxn('dehydration-ethanol', 'Dehydration of ethanol', 'ইথানলের ডিহাইড্রেশন',
    'CCO>>C=C',
    'conc. H₂SO₄ | 443 K (170 °C)', 'C₂H₅OH → CH₂=CH₂ + H₂O',
    'dehydration, ethene preparation, ডিহাইড্রেশন'),
  rxn('hydration-ethene', 'Hydration of ethene', 'ইথিনের হাইড্রেশন',
    'C=C>>CCO',
    'H₂O | H₃PO₄, 573 K, 60–70 atm', 'CH₂=CH₂ + H₂O → C₂H₅OH',
    'hydration, ethanol preparation, হাইড্রেশন'),
  rxn('hbr-addition-propene', "Addition of HBr to propene (Markovnikov)", 'প্রোপিনে HBr যোগ (মার্কনিকভ নীতি)',
    'CC=C>>CC(C)Br',
    'HBr', 'CH₃CH=CH₂ + HBr → CH₃CHBrCH₃',
    'markovnikov, markovnikoff, hydrohalogenation, addition, মার্কনিকভ, মার্কভনিকভ'),
  rxn('bromine-addition-ethene', 'Addition of bromine to ethene', 'ইথিনে ব্রোমিন যোগ',
    'C=C>>BrCCBr',
    'Br₂ | CCl₄', 'CH₂=CH₂ + Br₂ → BrCH₂–CH₂Br',
    'halogenation, bromination, addition, bromine test, হ্যালোজেনেশন, ব্রোমিন পানি'),
  rxn('acetylation-aniline', 'Acetylation of aniline', 'অ্যানিলিনের অ্যাসিটাইলেশন',
    'NC1=CC=CC=C1.CC(Cl)=O>>CC(=O)NC1=CC=CC=C1',
    'pyridine', 'C₆H₅NH₂ + CH₃COCl → C₆H₅NHCOCH₃ + HCl',
    'acetylation, acetanilide preparation, এসিটাইলেশন'),
  rxn('williamson-anisole', 'Williamson ether synthesis (anisole)', 'উইলিয়ামসন ইথার সংশ্লেষ (অ্যানিসোল)',
    'OC1=CC=CC=C1.CI>>COC1=CC=CC=C1',
    'NaOH', 'C₆H₅ONa + CH₃I → C₆H₅OCH₃ + NaI',
    'williamson, williamsan, ether synthesis, anisole preparation, উইলিয়ামসন'),
  rxn('clemmensen-reduction', 'Clemmensen reduction', 'ক্লেমেনসেন বিজারণ',
    'CC(=O)C1=CC=CC=C1>>CCC1=CC=CC=C1',
    'Zn–Hg / conc. HCl', 'C₆H₅COCH₃ + 4[H] → C₆H₅C₂H₅ + H₂O',
    'clemmensen, clemensen, reduction, ক্লেমেনসেন, বিজারণ'),
  rxn('oxidation-ethanol', 'Oxidation of ethanol to acetaldehyde', 'ইথানলের জারণ (অ্যাসিটালডিহাইড)',
    'CCO>>CC=O',
    'K₂Cr₂O₇ / H⁺ (controlled)', 'CH₃CH₂OH + [O] → CH₃CHO + H₂O',
    'oxidation, alcohol oxidation, জারণ'),
  rxn('oxidation-acetaldehyde', 'Oxidation of acetaldehyde to acetic acid', 'অ্যাসিটালডিহাইডের জারণ (অ্যাসিটিক এসিড)',
    'CC=O>>CC(O)=O',
    'KMnO₄ / H⁺', 'CH₃CHO + [O] → CH₃COOH',
    'oxidation, aldehyde oxidation, জারণ'),
  rxn('cannizzaro-reaction', 'Cannizzaro reaction (benzoic acid route)', 'ক্যানিজারো বিক্রিয়া (বেনজোয়িক এসিড)',
    'O=CC1=CC=CC=C1>>OC(=O)C1=CC=CC=C1',
    'conc. NaOH, then H⁺', '2C₆H₅CHO + NaOH → C₆H₅CH₂OH + C₆H₅COONa',
    'cannizzaro, canizzaro, disproportionation, ক্যানিজারো, কানিজারো'),
];

const chemistryDiagrams = [...aromatic, ...heterocyclic, ...reactions, ...alicyclic, ...aliphatic];
export default chemistryDiagrams;

export const getDiagramById = (id) => chemistryDiagrams.find((d) => d.id === id) || null;

// ------------------------------------------------------------------ সার্চ (ইংরেজি + বাংলা + বাংলিশ, সামান্য বানান ভুল সহনীয়)
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

export const normalizeText = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/\u09af\u09bc/g, '\u09df') // য + ় → য়
    .replace(/\u09a1\u09bc/g, '\u09dc') // ড + ় → ড়
    .replace(/\u09a2\u09bc/g, '\u09dd') // ঢ + ় → ঢ়
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(/[–—−‐-]/g, ' ')
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const editDistance = (a, b) => {
  const x = Array.from(a);
  const y = Array.from(b);
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
};

const wordsOf = (arr) => {
  const out = new Set();
  arr.forEach((f) => f.split(' ').forEach((w) => w.length > 1 && out.add(w)));
  return [...out];
};

// সার্চ ইনডেক্স একবারই বানানো হয়
const INDEX = new Map(
  chemistryDiagrams.map((d) => {
    const primary = [normalizeText(d.name_en), normalizeText(d.name_bn)];
    const alias = d.aliases.map(normalizeText).filter(Boolean);
    const meta = [normalizeText(d.id), normalizeText(TYPE_LABELS[d.type]?.en), normalizeText(TYPE_LABELS[d.type]?.bn)];
    return [d.id, { primary, alias, meta, words: wordsOf([...primary, ...alias]) }];
  })
);

const tokenScore = (token, ix) => {
  let best = 0;
  const consider = (field, weights) => {
    if (!field) return;
    if (field === token) best = Math.max(best, weights[0]);
    else if (field.startsWith(token)) best = Math.max(best, weights[1]);
    else if (field.includes(` ${token}`)) best = Math.max(best, weights[2]);
    else if (field.includes(token)) best = Math.max(best, weights[3]);
  };
  ix.primary.forEach((f) => consider(f, [100, 75, 65, 45]));
  ix.alias.forEach((f) => consider(f, [90, 65, 55, 35]));
  ix.meta.forEach((f) => consider(f, [20, 15, 12, 10]));
  if (best === 0 && Array.from(token).length >= 4) {
    const tl = Array.from(token).length;
    const maxDist = tl >= 8 ? 2 : 1;
    ix.words.forEach((w) => {
      const wl = Array.from(w).length;
      if (Math.abs(wl - tl) > maxDist) return;
      const dist = editDistance(token, w);
      if (dist <= maxDist) best = Math.max(best, 28 - dist * 6);
    });
  }
  return best;
};

// query ফাঁকা হলে সব (type ফিল্টার সহ); নইলে প্রাসঙ্গিকতা অনুযায়ী সাজানো
export function searchDiagrams(query, type = 'all') {
  const pool = type === 'all' ? chemistryDiagrams : chemistryDiagrams.filter((d) => d.type === type);
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (!tokens.length) return pool;
  const scored = [];
  pool.forEach((d, order) => {
    const ix = INDEX.get(d.id);
    let total = 0;
    for (const tk of tokens) {
      const s = tokenScore(tk, ix);
      if (!s) return; // প্রতিটি শব্দ মিলতে হবে
      total += s;
    }
    scored.push({ d, total, order });
  });
  scored.sort((a, b) => b.total - a.total || a.order - b.order);
  return scored.map((x) => x.d);
}
