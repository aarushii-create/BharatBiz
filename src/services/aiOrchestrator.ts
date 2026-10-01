import {
  SupportedLanguage,
  DeterministicAnalysisResult,
  AssistantDecision,
  Supplier,
} from '../types';

/**
 * AI Orchestrator Layer
 * Generates clear, compassionate, and precise business explanations in Indian languages
 * grounded strictly in deterministic calculations.
 */
export function processUserQuery(
  query: string,
  language: SupportedLanguage,
  analysis: DeterministicAnalysisResult,
  supplier: Supplier
): AssistantDecision {
  const normalized = query.toLowerCase();
  const traceId = `TRACE-${Date.now().toString(36).toUpperCase()}`;

  // Intent classification
  let intent: AssistantDecision['intent'] = 'profit_decline';
  if (
    normalized.includes('slow') ||
    normalized.includes('விற்கிறது') ||
    normalized.includes('மெது') ||
    normalized.includes('धीमे') ||
    normalized.includes('బిక్రా') ||
    normalized.includes('నడుస్తోంది')
  ) {
    intent = 'slow_moving_inventory';
  } else if (
    normalized.includes('reorder') ||
    normalized.includes('order') ||
    normalized.includes('ஆர்டர்') ||
    normalized.includes('சரக்கு') ||
    normalized.includes('खरीद') ||
    normalized.includes('ऑर्डर')
  ) {
    intent = 'reorder_recommendation';
  }

  const { periodComparison, expenseBreakdown, slowMovingProduct } = analysis;
  const absProfitDelta = Math.abs(periodComparison.profitDelta).toLocaleString('en-IN');
  const purchaseInc = expenseBreakdown.purchaseCostIncrease.toLocaleString('en-IN');
  const wastageInc = expenseBreakdown.wastageIncrease.toLocaleString('en-IN');
  const deliveryInc = expenseBreakdown.deliveryIncrease.toLocaleString('en-IN');
  const savings = slowMovingProduct.estimatedSavings.toLocaleString('en-IN');

  let explanation = '';
  let recommendation = '';

  // Multilingual Explanations grounded in exact numbers
  if (language === 'ta') {
    // Tamil
    explanation = `வணக்கம் ரவி அண்ணா, உங்கள் கடையின் நிகர லாபம் கடந்த மாதத்தை விட ₹${absProfitDelta} குறைந்திருக்கிறது.

முக்கிய காரணங்கள் (ஆதாரங்களுடன்):
• கொள்முதல் செலவு: +₹${purchaseInc} அதிகரித்துள்ளது (தேவைக்கு அதிகமாக வாங்கப்பட்டது).
• பொருள் சேதம் & வீணாதல்: +₹${wastageInc} அதிகரித்துள்ளது (கிடங்கில் ஈரப்பதம் காரணமாக அரிசி மூட்டைகள் பாழானது).
• அவசர சரக்கு வண்டி கட்டணம்: +₹${deliveryInc} அதிகரித்துள்ளது.
• விற்பனை வருமானம்: சாதாரணமாக ₹${periodComparison.currentRevenue.toLocaleString('en-IN')} அளவில் நிலைத்திருக்கிறது.

கண்டறியப்பட்ட பிரச்சனை:
பொன்னி புழுங்கல் அரிசி (25 கிலோ) விற்பனை வேகம் ${slowMovingProduct.velocityDropPercent}% குறைந்துள்ளது. கடையில் இன்னும் ${slowMovingProduct.currentStock} மூட்டைகள் தேங்கியுள்ளன.`;

    recommendation = `அடுத்த பொன்னி புழுங்கல் அரிசி ஆர்டரை வழக்கமான ${slowMovingProduct.standardOrderQty} மூட்டைகளில் இருந்து ${slowMovingProduct.recommendedOrderQty} மூட்டைகளாகக் குறைக்கவும். இதனால் உடனடி மூலதனத்தில் ₹${savings} மிச்சமாகும் மற்றும் வீணாதல் தடுக்கப்படும்.`;
  } else if (language === 'hi') {
    // Hindi
    explanation = `नमस्ते रवि जी, आपकी दुकान का शुद्ध मुनाफ़ा (Net Profit) पिछले महीने की तुलना में ₹${absProfitDelta} कम हुआ है।

मुख्य कारण (सटीक आंकड़ों के साथ):
• माल खरीद लागत (Purchase Cost): +₹${purchaseInc} बढ़ गई (मांग से अधिक स्टॉक मंगाया गया)।
• सामान का नुकसान व वेस्टेज (Wastage): +₹${wastageInc} बढ़ गया (गोदाम में नमी के कारण बोरियां खराब हुईं)।
• आपातकालीन ढुलाई खर्च (Delivery): +₹${deliveryInc} बढ़ गया।
• दुकान की कुल बिक्री (Revenue): ₹${periodComparison.currentRevenue.toLocaleString('en-IN')} पर लगभग स्थिर रही (+0.2%)।

जांच में मिली रुकावट:
पोन्नी उबला चावल (25kg) की बिक्री में ${slowMovingProduct.velocityDropPercent}% की गिरावट आई है। दुकान में अभी भी ${slowMovingProduct.currentStock} बोरियां बिना बिकी रखी हैं।`;

    recommendation = `आगामी ऑर्डर में पोन्नी चावल का ऑर्डर सामान्य ${slowMovingProduct.standardOrderQty} बोरियों से घटाकर ${slowMovingProduct.recommendedOrderQty} बोरी करें। इससे ₹${savings} की कार्यशील पूंजी तुरंत बचेगी और अनाज खराब होने से रुकेगा।`;
  } else if (language === 'te') {
    // Telugu
    explanation = `నమస్కారం రవి గారు, మీ వ్యాపార నికర లాభం గత నెల కంటే ₹${absProfitDelta} తగ్గింది.

ప్రధాన కారణాలు:
• కొనుగోలు ఖర్చు: +₹${purchaseInc} పెరిగింది.
• సరుకు వృధా & నష్టం (Wastage): +₹${wastageInc} పెరిగింది (గోదాములో తేమ వల్ల పాడైంది).
• అత్యవసర డెలివరీ ఖర్చులు: +₹${deliveryInc} పెరిగాయి.
• అమ్మకాల రాబడి: దాదాపు స్థిరంగా ₹${periodComparison.currentRevenue.toLocaleString('en-IN')} ఉంది.

గుర్తించిన సమస్య:
పొన్ని బాయిల్డ్ రైస్ (25kg) అమ్మకం వేగం ${slowMovingProduct.velocityDropPercent}% తగ్గింది. ఇంకా ${slowMovingProduct.currentStock} బస్తాలు స్టాక్‌లో మిగిలి ఉన్నాయి.`;

    recommendation = `తదుపరి ఆర్డర్‌లో పొన్ని రైస్ సంఖ్యను ${slowMovingProduct.standardOrderQty} నుండి ${slowMovingProduct.recommendedOrderQty} బస్తాలకు తగ్గించండి. దీనివల్ల ₹${savings} మూలధనం ఆదా అవుతుంది.`;
  } else {
    // English
    explanation = `Hello Ravi, your net store profit decreased by ₹${absProfitDelta} compared to last month.

Key Deterministic Contributors:
• Inventory Purchase Cost: +₹${purchaseInc} (bulk overstocking before verifying sell-through).
• Spoilage & Wastage: +₹${wastageInc} (moisture damage & torn gunny bags from tight warehouse stacking).
• Rush Logistics & Demurrage: +₹${deliveryInc} (emergency tempo van trips).
• Customer Revenue: Remained healthy and virtually flat at ₹${periodComparison.currentRevenue.toLocaleString('en-IN')} (+0.2%).

Root Cause Identified:
Ponni Boiled Rice (25kg) weekly sales velocity dropped by ${slowMovingProduct.velocityDropPercent}%. You currently have ${slowMovingProduct.currentStock} bags in store, far above the reorder trigger of 60 bags.`;

    recommendation = `Reduce your upcoming procurement for Ponni Boiled Rice from the standard ${slowMovingProduct.standardOrderQty} bags to ${slowMovingProduct.recommendedOrderQty} bags. This directly frees up ₹${savings} in working capital and prevents further spoilage.`;
  }

  // Proposed Consequential Action: Draft PO
  const poDraft = {
    poNumber: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    businessId: 'biz-murugan-01',
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierPhone: supplier.phone,
    productId: slowMovingProduct.productId,
    productName: slowMovingProduct.productName,
    standardOrderQuantity: slowMovingProduct.standardOrderQty,
    approvedOrderQuantity: slowMovingProduct.recommendedOrderQty,
    unitPrice: slowMovingProduct.unitPrice,
    totalCost: slowMovingProduct.recommendedOrderQty * slowMovingProduct.unitPrice,
    estimatedCapitalSaved: slowMovingProduct.estimatedSavings,
    notes: `Adjusted procurement based on -${slowMovingProduct.velocityDropPercent}% velocity reduction and excess on-hand inventory (${slowMovingProduct.currentStock} units).`,
    evidenceTraceId: traceId,
  };

  return {
    traceId,
    query,
    language,
    intent,
    analysis,
    explanation,
    recommendation,
    proposedAction: {
      actionType: 'GENERATE_PURCHASE_ORDER',
      requiresApproval: true,
      poDraft,
    },
  };
}
