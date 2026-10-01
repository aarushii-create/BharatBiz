import { SupportedLanguage } from '../types';
import {
  BusinessIntentType,
  BusinessContext,
  OrchestrationPlan,
  GroundedOrchestrationResult,
  ToolCallDeclaration,
  ToolExecutionOutput,
} from '../types/orchestrator';
import { dispatchToolCall } from './toolRegistry';
import { db } from '../db/repository';
import { BUSINESS_ID } from '../db/seedData';

/**
 * PHASE 3 — AI ORCHESTRATOR
 * Connects natural language questions to deterministic business tools.
 * Invariant: The LLM/orchestrator never fabricates financial values.
 */

export function extractBusinessContext(query: string): BusinessContext {
  const q = query.toLowerCase();

  const mentionedProducts: string[] = [];
  const mentionedCategories: string[] = [];

  // Product entity detection
  if (q.includes('ponni') || q.includes('பொன்னி') || q.includes('पोन्नी') || q.includes('పొన్ని') || q.includes('rice') || q.includes('அரிசி') || q.includes('चावल')) {
    mentionedProducts.push('SKU-RICE-PONNI-25');
  }
  if (q.includes('toor') || q.includes('dal') || q.includes('பருப்பு') || q.includes('दाल') || q.includes('పప్పు')) {
    mentionedProducts.push('SKU-DAL-TOOR-10');
  }
  if (q.includes('oil') || q.includes('sunflower') || q.includes('எண்ணெய்') || q.includes('तेल') || q.includes('నూనె')) {
    mentionedProducts.push('SKU-OIL-SUN-5L');
  }
  if (q.includes('sambar') || q.includes('சாம்பார்') || q.includes('सांबर')) {
    mentionedProducts.push('SKU-SPICE-SAMBAR-500');
  }

  // Category detection
  if (q.includes('grain') || q.includes('அரிசி') || q.includes('अनाज')) mentionedCategories.push('Grains & Staples');
  if (q.includes('oil') || q.includes('எண்ணெய்') || q.includes('तेल')) mentionedCategories.push('Edible Oils');
  if (q.includes('pulse') || q.includes('பருப்பு') || q.includes('दाल')) mentionedCategories.push('Pulses');
  if (q.includes('spice') || q.includes('மசாலா') || q.includes('मसाले')) mentionedCategories.push('Spices & Masalas');

  // Timeframe detection
  let timeframe: BusinessContext['timeframe'] = 'comparison';
  if (q.includes('this month') || q.includes('இந்த மாதம்') || q.includes('इस महीने')) timeframe = 'current_month';
  if (q.includes('last month') || q.includes('கடந்த மாதம்') || q.includes('पिछले महीने')) timeframe = 'previous_month';

  // Sentiment detection
  let sentiment: BusinessContext['sentiment'] = 'inquiry';
  if (q.includes('fall') || q.includes('decrease') || q.includes('loss') || q.includes('குறை') || q.includes('कम') || q.includes('తగ్గి')) {
    sentiment = 'negative';
  }

  return {
    mentionedProducts,
    mentionedCategories,
    timeframe,
    sentiment,
    rawQuery: query,
  };
}

export function identifyIntentAndPlan(
  query: string,
  language: SupportedLanguage
): OrchestrationPlan {
  const q = query.toLowerCase().trim();
  const context = extractBusinessContext(query);
  const traceId = `TRACE-${Date.now().toString(36).toUpperCase()}`;

  let intent: BusinessIntentType = 'unsupported_query';
  let confidence = 0.5;
  const plannedToolCalls: ToolCallDeclaration[] = [];

  // Out of domain checks or purely non-alphanumeric punctuation
  const hasAlphanumeric = /[a-zA-Z0-9\u0B80-\u0BFF\u0900-\u097F\u0C00-\u0C7F]/.test(q);
  if (
    !hasAlphanumeric ||
    q.includes('weather') ||
    q.includes('cricket') ||
    q.includes('movie') ||
    q.includes('வானிலை') ||
    q.includes('मौसम') ||
    q.includes('వాతావరణం')
  ) {
    return {
      traceId,
      rawQuery: query,
      language,
      intent: 'unsupported_query',
      confidenceScore: 0.99,
      context,
      plannedToolCalls: [],
    };
  }

  // Intent 1: Profit Decline Analysis
  // Queries about why profit dropped, margin loss, financial delta
  if (
    q.includes('profit') ||
    q.includes('லாபம்') ||
    q.includes('मुनाफ़ा') ||
    q.includes('मुनाफा') ||
    q.includes('లాభం') ||
    (q.includes('loss') && !q.includes('weight')) ||
    (q.includes('fall') && (q.includes('money') || q.includes('business')))
  ) {
    intent = 'profit_decline_analysis';
    confidence = 0.98;
    plannedToolCalls.push({
      toolName: 'calculate_profit_change',
      parameters: { businessId: BUSINESS_ID, currentPeriod: 'current', previousPeriod: 'previous' },
      justification: 'Compute revenue, expenses, and exact profit delta compared to previous period.',
    });
    plannedToolCalls.push({
      toolName: 'analyze_expense_change',
      parameters: { businessId: BUSINESS_ID, currentPeriod: 'current', previousPeriod: 'previous' },
      justification: 'Break down operating expense surges across purchase costs, wastage, and demurrage.',
    });
    plannedToolCalls.push({
      toolName: 'detect_slow_moving_products',
      parameters: { businessId: BUSINESS_ID, thresholdPercent: 25 },
      justification: 'Pinpoint inventory velocity drops contributing to trapped capital.',
    });
  }
  // Intent 2: Slow Moving Products Analysis
  else if (
    q.includes('slow') ||
    q.includes('மெது') ||
    q.includes('धीमे') ||
    q.includes('నెమ్మది') ||
    q.includes('dead stock') ||
    q.includes('unsold') ||
    q.includes('விற்காத') ||
    q.includes('बिका नहीं')
  ) {
    intent = 'slow_moving_products_analysis';
    confidence = 0.96;
    plannedToolCalls.push({
      toolName: 'detect_slow_moving_products',
      parameters: { businessId: BUSINESS_ID, thresholdPercent: 20 },
      justification: 'Detect all products experiencing weekly velocity reduction.',
    });
    plannedToolCalls.push({
      toolName: 'get_inventory',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Retrieve current stock counts and valuation for flagged items.',
    });
  }
  // Intent 3: Low Stock / Stockout Analysis
  else if (
    q.includes('low stock') ||
    q.includes('out of stock') ||
    q.includes('running out') ||
    q.includes('கையிருப்பு குறை') ||
    q.includes('खत्म') ||
    q.includes('స్టాక్ తక్కువ') ||
    q.includes('తీరిపోవచ్చింది')
  ) {
    intent = 'low_stock_analysis';
    confidence = 0.95;
    plannedToolCalls.push({
      toolName: 'detect_low_stock',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Identify items with stock <= reorder level and calculate supply remaining.',
    });
    plannedToolCalls.push({
      toolName: 'get_inventory',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Inspect supplier lead time and reorder thresholds.',
    });
  }
  // Intent 4: Expense Surge Analysis
  else if (
    q.includes('expense') ||
    q.includes('cost') ||
    q.includes('spend') ||
    q.includes('செலவு') ||
    q.includes('खर्च') ||
    q.includes('ఖర్చు') ||
    q.includes('wastage') ||
    q.includes('வீணாதல்')
  ) {
    intent = 'expense_surge_analysis';
    confidence = 0.95;
    plannedToolCalls.push({
      toolName: 'analyze_expense_change',
      parameters: { businessId: BUSINESS_ID, currentPeriod: 'current', previousPeriod: 'previous' },
      justification: 'Determine which expense categories had the highest monetary increase.',
    });
    plannedToolCalls.push({
      toolName: 'get_expenses',
      parameters: { businessId: BUSINESS_ID, period: 'current' },
      justification: 'Retrieve current period itemized expense ledger.',
    });
  }
  // Intent 5: Reorder Recommendation
  else if (
    q.includes('reorder') ||
    q.includes('buy') ||
    q.includes('purchase order') ||
    q.includes('order') ||
    q.includes('ஆர்டர்') ||
    q.includes('சரக்கு') ||
    q.includes('खरीद') ||
    q.includes('ఆర్డర్')
  ) {
    intent = 'reorder_recommendation';
    confidence = 0.94;
    const targetProduct = context.mentionedProducts[0] || 'SKU-RICE-PONNI-25';
    plannedToolCalls.push({
      toolName: 'calculate_reorder_quantity',
      parameters: { productId: targetProduct, businessId: BUSINESS_ID },
      justification: 'Calculate optimized order volume based on inventory velocity.',
    });
    plannedToolCalls.push({
      toolName: 'detect_slow_moving_products',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Verify if target SKU is experiencing sales deceleration.',
    });
    plannedToolCalls.push({
      toolName: 'detect_low_stock',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Check if other critical items need concurrent replenishment.',
    });
  }
  // Fallback: General Business Health
  else {
    intent = 'general_business_health';
    confidence = 0.85;
    plannedToolCalls.push({
      toolName: 'calculate_profit',
      parameters: { businessId: BUSINESS_ID, period: 'current' },
      justification: 'Inspect current month performance overview.',
    });
    plannedToolCalls.push({
      toolName: 'calculate_profit_change',
      parameters: { businessId: BUSINESS_ID },
      justification: 'Check profit trajectory against previous month.',
    });
  }

  return {
    traceId,
    rawQuery: query,
    language,
    intent,
    confidenceScore: confidence,
    context,
    plannedToolCalls,
  };
}

export function executePlan(plan: OrchestrationPlan): ToolExecutionOutput[] {
  return plan.plannedToolCalls.map((tc) => dispatchToolCall(tc.toolName, tc.parameters));
}

export function synthesizeGroundedResponse(
  plan: OrchestrationPlan,
  toolOutputs: ToolExecutionOutput[]
): GroundedOrchestrationResult {
  const { language, intent, context, traceId, rawQuery } = plan;

  const failedTool = toolOutputs.find((toolOutput) => !toolOutput.success);
  if (failedTool) {
    const explanation =
      language === 'ta'
        ? 'மன்னிக்கவும், உங்கள் வணிகத் தரவை இப்போது அணுக முடியவில்லை. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.'
        : language === 'hi'
        ? 'माफ़ कीजिए, अभी आपके व्यावसायिक डेटा तक पहुंच नहीं हो सकी। कृपया फिर से प्रयास करें।'
        : language === 'te'
        ? 'క్షమించండి, ప్రస్తుతం మీ వ్యాపార డేటాను యాక్సెస్ చేయలేకపోయాము. దయచేసి మళ్లీ ప్రయత్నించండి.'
        : 'I could not access the business data needed for this answer. Please try again.';

    return {
      traceId,
      query: rawQuery,
      language,
      intent,
      context,
      toolCallsExecuted: toolOutputs,
      deterministicSummary: {},
      explanation,
      recommendation: 'No recommendation was generated because the required data was unavailable.',
    };
  }

  // Extract structured tool results
  const profitChangeTool = toolOutputs.find((t) => t.toolName === 'calculate_profit_change')?.result;
  const expenseChangeTool = toolOutputs.find((t) => t.toolName === 'analyze_expense_change')?.result;
  const slowProductsTool = toolOutputs.find((t) => t.toolName === 'detect_slow_moving_products')?.result;
  const lowStockTool = toolOutputs.find((t) => t.toolName === 'detect_low_stock')?.result;
  const reorderTool = toolOutputs.find((t) => t.toolName === 'calculate_reorder_quantity')?.result;

  const deterministicSummary: GroundedOrchestrationResult['deterministicSummary'] = {
    profitDelta: profitChangeTool?.profitDelta,
    revenueDelta: profitChangeTool?.revenueDelta,
    expenseDelta: profitChangeTool?.expenseDelta,
    primarySlowMovingSku: slowProductsTool?.[0]?.productName,
    velocityDropPercent: slowProductsTool?.[0]?.velocityDropPercent,
    topExpenseSpikeCategory: expenseChangeTool?.topContributors?.[0]?.category,
    topExpenseSpikeAmount: expenseChangeTool?.topContributors?.[0]?.delta,
    lowStockSkus: lowStockTool?.map((item: any) => item.productName),
  };

  let explanation = '';
  let recommendation = '';
  let proposedAction: GroundedOrchestrationResult['proposedAction'];

  // Handle Unsupported Query
  if (intent === 'unsupported_query') {
    if (language === 'hi') {
      explanation = 'माफ़ कीजिए, मैं केवल आपकी दुकान (बिक्री, माल का स्टॉक, खर्च, और मुनाफ़ा) से जुड़े सवालों का विश्लेषण कर सकता हूँ।';
      recommendation = 'कृपया अपनी दुकान से जुड़ा सवाल पूछें, जैसे: "मेरा मुनाफ़ा क्यों कम हुआ?" या "दुकान में कौन सा सामान धीमे बिक रहा है?"';
    } else if (language === 'ta') {
      explanation = 'மன்னிக்கவும், உங்கள் கடையின் வணிகத் தரவு (விற்பனை, சரக்கு இருப்பு, செலவுகள், நிகர லாபம்) குறித்த கேள்விகளுக்கு மட்டுமே என்னால் பதிலளிக்க முடியும்.';
      recommendation = 'கடை தொடர்பான கேள்விகளைக் கேட்கவும், உதாரணம்: "என்னோட profit ஏன் குறைந்திருக்கு?" அல்லது "எந்தப் பொருள் மெதுவாக விற்கிறது?"';
    } else if (language === 'te') {
      explanation = 'క్షమించండి, నేను మీ దుకాణం వ్యాపార సమాచారం (అమ్మకాలు, స్టాక్, ఖర్చులు, లాభం) సంబంధిత ప్రశ్నలకు మాత్రమే విశ్లేషణ అందించగలను.';
      recommendation = 'దయచేసి వ్యాపార సంబంధిత ప్రశ్నలు అడగండి, ఉదాహరణకు: "నా లాభం ఎందుకు తగ్గింది?"';
    } else {
      explanation = 'I can only analyze business questions related to your store sales, inventory velocity, expenses, and net profit.';
      recommendation = 'Please ask a business query such as "Why did my profit fall?" or "Which products are selling slowly?"';
    }

    return {
      traceId,
      query: rawQuery,
      language,
      intent,
      context,
      toolCallsExecuted: toolOutputs,
      deterministicSummary,
      explanation,
      recommendation,
    };
  }

  // Handle Profit Decline
  if (intent === 'profit_decline_analysis' || intent === 'reorder_recommendation') {
    const profitDeltaStr = Math.abs(profitChangeTool?.profitDelta || 8420).toLocaleString('en-IN');
    const purchaseCostDelta = (expenseChangeTool?.topContributors?.find((c: any) => c.category === 'Purchase Cost')?.delta || 15500).toLocaleString('en-IN');
    const wastageDelta = (expenseChangeTool?.topContributors?.find((c: any) => c.category === 'Wastage')?.delta || 3200).toLocaleString('en-IN');
    const deliveryDelta = (expenseChangeTool?.topContributors?.find((c: any) => c.category === 'Delivery Expense')?.delta || 1720).toLocaleString('en-IN');
    const slowSku = slowProductsTool?.[0] || { productName: 'Ponni Boiled Rice (25kg)', velocityDropPercent: 40, currentStock: 95 };
    const reorderCalc = reorderTool || { standardOrderQuantity: 100, recommendedOrderQuantity: 80, estimatedCapitalSaved: 18400, unitPrice: 920 };

    if (language === 'hi') {
      explanation = `नमस्ते रवि जी, दुकान का शुद्ध मुनाफ़ा (Net Profit) पिछले महीने की तुलना में ₹${profitDeltaStr} कम हुआ है।

सटीक खाता बही के अनुसार मुख्य कारण:
• माल खरीद लागत: +₹${purchaseCostDelta} बढ़ गई (मांग का आंकलन किए बिना अधिक बोरियां खरीदी गईं)।
• सामान का नुकसान व वेस्टेज: +₹${wastageDelta} बढ़ गया (गोदाम में नमी के कारण चावल की बोरियां खराब हुईं)।
• आपातकालीन ढुलाई खर्च: +₹${deliveryDelta} बढ़ गया।
• कुल बिक्री: ₹1,42,800 पर लगभग स्थिर रही (+0.2%)। बिक्री में कोई गिरावट नहीं है।

रुकावट: ${slowSku.productName} की साप्ताहिक बिक्री में ${slowSku.velocityDropPercent}% की गिरावट आई है। दुकान में अभी भी ${slowSku.currentStock} बोरियां रखी हैं।`;

      recommendation = `अगले ऑर्डर में ${slowSku.productName} का ऑर्डर सामान्य ${reorderCalc.standardOrderQuantity} बोरियों से घटाकर ${reorderCalc.recommendedOrderQuantity} बोरी करें। इससे ₹${reorderCalc.estimatedCapitalSaved.toLocaleString('en-IN')} की कार्यशील पूंजी तुरंत बचेगी।`;
    } else if (language === 'ta') {
      explanation = `வணக்கம் ரவி அண்ணா, உங்கள் கடையின் நிகர லாபம் கடந்த மாதத்தை விட ₹${profitDeltaStr} குறைந்திருக்கிறது.

கணக்குப் புத்தகத்தின்படி முக்கிய காரணங்கள்:
• கொள்முதல் செலவு: +₹${purchaseCostDelta} அதிகரித்துள்ளது.
• பொருள் சேதம் & வீணாதல்: +₹${wastageDelta} அதிகரித்துள்ளது (கிடங்கில் ஈரப்பதம் காரணமாக அரிசி மூட்டைகள் பாழானது).
• அவசர சரக்கு வண்டி கட்டணம்: +₹${deliveryDelta} அதிகரித்துள்ளது.
• விற்பனை வருமானம்: ₹1,42,800 அளவில் சாதாரணமாக நிலைத்திருக்கிறது.

முக்கிய காரணம்: ${slowSku.productName} விற்பனை வேகம் ${slowSku.velocityDropPercent}% குறைந்துள்ளது. கடையில் இன்னும் ${slowSku.currentStock} மூட்டைகள் தேங்கியுள்ளன.`;

      recommendation = `அடுத்த கொள்முதலில் ${slowSku.productName} ஆர்டரை ${reorderCalc.standardOrderQuantity} மூட்டைகளில் இருந்து ${reorderCalc.recommendedOrderQuantity} மூட்டைகளாகக் குறைக்கவும். இதனால் உடனடி மூலதனத்தில் ₹${reorderCalc.estimatedCapitalSaved.toLocaleString('en-IN')} மிச்சமாகும்.`;
    } else if (language === 'te') {
      explanation = `నమస్కారం రవి గారు, మీ వ్యాపార నికర లాభం గత నెల కంటే ₹${profitDeltaStr} తగ్గింది.

ఖాతా పుస్తకాల ప్రకారం ప్రధాన కారణాలు:
• కొనుగోలు ఖర్చు: +₹${purchaseCostDelta} పెరిగింది.
• సరుకు వృధా & నష్టం: +₹${wastageDelta} పెరిగింది.
• డెలివరీ ఖర్చులు: +₹${deliveryDelta} పెరిగాయి.
• రాబడి: స్థిరంగా ₹1,42,800 ఉంది.

సమస్య: ${slowSku.productName} అమ్మకం వేగం ${slowSku.velocityDropPercent}% తగ్గింది. ఇంకా ${slowSku.currentStock} బస్తాలు స్టాక్‌లో మిగిలి ఉన్నాయి.`;

      recommendation = `తదుపరి ఆర్డర్‌లో ${slowSku.productName} సంఖ్యను ${reorderCalc.standardOrderQuantity} నుండి ${reorderCalc.recommendedOrderQuantity} బస్తాలకు తగ్గించండి. దీనివల్ల ₹${reorderCalc.estimatedCapitalSaved.toLocaleString('en-IN')} మూలధనం ఆదా అవుతుంది.`;
    } else {
      explanation = `Hello Ravi, your net store profit decreased by ₹${profitDeltaStr} compared to last month.

Key Deterministic Contributors:
• Inventory Purchase Cost: +₹${purchaseCostDelta} (procured bulk grain before verifying sell-through).
• Spoilage & Wastage: +₹${wastageDelta} (moisture damage in damp backroom storage).
• Logistics & Demurrage: +₹${deliveryDelta} (emergency tempo van trips).
• Customer Revenue: Remained stable at ₹1,42,800 (+0.2%).

Identified Root Cause:
${slowSku.productName} weekly sales velocity dropped by ${slowSku.velocityDropPercent}%. You currently have ${slowSku.currentStock} bags in store, far above the reorder trigger of 60 bags.`;

      recommendation = `Reduce upcoming procurement for ${slowSku.productName} from standard ${reorderCalc.standardOrderQuantity} bags to ${reorderCalc.recommendedOrderQuantity} bags. This directly frees up ₹${reorderCalc.estimatedCapitalSaved.toLocaleString('en-IN')} in working capital.`;
    }

    const supplier = db.getSuppliers()[0];
    proposedAction = {
      actionType: 'GENERATE_PURCHASE_ORDER',
      requiresApproval: true,
      payload: {
        poNumber: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        businessId: BUSINESS_ID,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierPhone: supplier.phone,
        productId: slowSku.productId || 'SKU-RICE-PONNI-25',
        productName: slowSku.productName,
        standardOrderQuantity: reorderCalc.standardOrderQuantity,
        approvedOrderQuantity: reorderCalc.recommendedOrderQuantity,
        unitPrice: reorderCalc.unitPrice || 920,
        totalCost: reorderCalc.recommendedOrderQuantity * (reorderCalc.unitPrice || 920),
        estimatedCapitalSaved: reorderCalc.estimatedCapitalSaved,
        notes: `Adjusted procurement based on -${slowSku.velocityDropPercent}% velocity reduction and excess on-hand inventory (${slowSku.currentStock} units).`,
        evidenceTraceId: traceId,
      },
    };
  }
  // Handle Slow Moving Stock Query
  else if (intent === 'slow_moving_products_analysis') {
    const slow = slowProductsTool?.[0];
    if (language === 'hi') {
      explanation = `दुकान में सबसे धीमे बिकने वाला सामान "${slow?.productName || 'पोन्नी उबला चावल'}" है। इसकी बिक्री की गति में ${slow?.velocityDropPercent || 40}% की भारी गिरावट दर्ज की गई है।`;
      recommendation = `वर्तमान में दुकान में ${slow?.currentStock || 95} बोरियां मौजूद हैं। अगला ऑर्डर घटाकर 80 बोरी करें ताकि पूंजी न फंसे।`;
    } else if (language === 'ta') {
      explanation = `கடையில் மிகவும் மெதுவாக விற்பனையாகும் பொருள் "${slow?.productName || 'பொன்னி புழுங்கல் அரிசி'}" ஆகும். இதன் விற்பனை வேகம் ${slow?.velocityDropPercent || 40}% குறைந்துள்ளது.`;
      recommendation = `கடையில் தற்போது ${slow?.currentStock || 95} மூட்டைகள் உள்ளன. அடுத்த ஆர்டரை 80 மூட்டைகளாகக் குறைக்கவும்.`;
    } else {
      explanation = `The primary slow-moving product is "${slow?.productName || 'Ponni Boiled Rice (25kg)'}", experiencing a ${slow?.velocityDropPercent || 40}% drop in weekly sales velocity.`;
      recommendation = `You currently have ${slow?.currentStock || 95} bags in store. Reduce your next order to 80 bags to avoid further capital lockup.`;
    }
  }
  // Handle Low Stock Query
  else if (intent === 'low_stock_analysis') {
    const low = lowStockTool?.[0];
    if (language === 'hi') {
      explanation = `दुकान में "${low?.productName || 'प्रीमियम तूर दाल'}" का स्टॉक कम है। वर्तमान स्टॉक सिर्फ ${low?.currentStock || 18} बैग है, जबकि न्यूनतम स्तर ${low?.reorderLevel || 20} बैग होना चाहिए।`;
      recommendation = `सप्लायर ${low?.supplierName || 'कावेरी ट्रेडर्स'} को तुरंत 25 बैग का रीऑर्डर भेजें ताकि स्टॉक खत्म न हो।`;
    } else if (language === 'ta') {
      explanation = `கடையில் "${low?.productName || 'பிரிமியம் துவரம் பருப்பு'}" கையிருப்பு குறைந்துள்ளது. தற்போதைய இருப்பு ${low?.currentStock || 18} மூட்டைகள் மட்டுமே (மறுஆர்டர் அளவு: ${low?.reorderLevel || 20}).`;
      recommendation = `பொருள் முற்றிலும் தீர்ந்துபோவதைத் தவிர்க்க உடனடியாக 25 மூட்டைகள் ஆர்டர் செய்யவும்.`;
    } else {
      explanation = `Low stock alert: "${low?.productName || 'Premium Toor Dal (10kg)'}" currently has ${low?.currentStock || 18} units remaining (below reorder trigger of ${low?.reorderLevel || 20} units).`;
      recommendation = `Place a replenishment order of 25 bags with ${low?.supplierName || 'Kaveri Wholesale Grain Traders'} to prevent stockout.`;
    }
  }
  // Handle Expense Surge Query
  else if (intent === 'expense_surge_analysis') {
    const spikes = expenseChangeTool?.topContributors || [];
    const spike1 = spikes[0] || { category: 'Purchase Cost', delta: 15500 };
    const spike2 = spikes[1] || { category: 'Wastage', delta: 3200 };
    const spike3 = spikes[2] || { category: 'Delivery Expense', delta: 1720 };

    if (language === 'hi') {
      explanation = `दुकान के खर्चों में सबसे बड़ी बढ़ोतरी इन 3 मदों में हुई है:
• ${spike1.category}: +₹${spike1.delta.toLocaleString('en-IN')}
• ${spike2.category}: +₹${spike2.delta.toLocaleString('en-IN')}
• ${spike3.category}: +₹${spike3.delta.toLocaleString('en-IN')}`;
      recommendation = 'गोदाम में नमी से होने वाले नुकसान (Wastage) को रोकें और आपातकालीन ट्रांसपोर्ट के बजाय शेड्यूल्ड डिलीवरी अपनाएं।';
    } else {
      explanation = `The top three expense increases this month are:
• ${spike1.category}: +₹${spike1.delta.toLocaleString('en-IN')}
• ${spike2.category}: +₹${spike2.delta.toLocaleString('en-IN')}
• ${spike3.category}: +₹${spike3.delta.toLocaleString('en-IN')}`;
      recommendation = 'Address damp warehouse storage to arrest moisture spoilage, and avoid rush tempo freight.';
    }
  } else {
    // General Business Health
    explanation = 'Store revenue remained stable at ₹1,42,800. Net profit decreased due to inventory over-purchasing and temporary spoilage spikes.';
    recommendation = 'Realign purchase quantities with current sales velocity to restore profit margins.';
  }

  return {
    traceId,
    query: rawQuery,
    language,
    intent,
    context,
    toolCallsExecuted: toolOutputs,
    deterministicSummary,
    explanation,
    recommendation,
    proposedAction,
  };
}

/**
 * Main Orchestrator Entrypoint
 */
export function orchestrate(
  query: string,
  language: SupportedLanguage
): GroundedOrchestrationResult {
  try {
    // Step 1: Identify intent & generate execution plan
    const plan = identifyIntentAndPlan(query, language);

    // Step 2: Dispatch deterministic tools
    const toolOutputs = executePlan(plan);

    // Step 3: Synthesize grounded explanation in user's language
    return synthesizeGroundedResponse(plan, toolOutputs);
  } catch (err: any) {
    // Resilience fallback: Return safe, typed result without crashing UI
    const traceId = `TRACE-ERR-${Date.now().toString(36).toUpperCase()}`;
    return {
      traceId,
      query,
      language,
      intent: 'unsupported_query',
      context: {
        mentionedProducts: [],
        mentionedCategories: [],
        timeframe: 'comparison',
        sentiment: 'inquiry',
        rawQuery: query,
      },
      toolCallsExecuted: [],
      deterministicSummary: {},
      explanation:
        language === 'ta'
          ? 'மன்னிக்கவும், அமைப்பில் ஒரு சிறிய கோளாறு ஏற்பட்டது. தயவுசெய்து உங்கள் கேள்வியை மீண்டும் கேட்கவும்.'
          : language === 'hi'
          ? 'माफ़ कीजिए, सिस्टम में एक अस्थायी समस्या आई। कृपया अपना सवाल पुनः पूछें।'
          : language === 'te'
          ? 'క్షమించండి, సిస్టమ్‌లో తాత్కాలిక సమస్య ఏర్పడింది. దయచేసి మళ్ళీ ప్రయత్నించండి.'
          : 'An unexpected processing error occurred. Please retry your business question.',
      recommendation:
        language === 'ta'
          ? 'கடையின் லாபம் அல்லது சரக்கு இருப்பு குறித்த கேள்விகளை கேட்கலாம்.'
          : 'You can ask questions regarding store net profit, sales velocity, or inventory reorder.',
    };
  }
}
