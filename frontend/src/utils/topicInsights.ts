export type TopicCategory = 'ai' | 'technology' | 'marketing' | 'ecommerce' | 'finance' | 'operations' | 'general';

export interface TopicProfile {
  category: TopicCategory;
  label: string;
  outlookTitle: string;
  outlookDescription: string;
  visual: string;
  accent: string;
}

export interface OutlookSection {
  title: string;
  items: string[];
}

const TOPIC_PROFILES: Record<TopicCategory, TopicProfile> = {
  ai: {
    category: 'ai',
    label: 'AI transformation',
    outlookTitle: 'Future AI Outlook',
    outlookDescription: 'A forward-looking technology brief for AI adoption, automation impact, governance, and market opportunity.',
    visual: '/topic-ai.svg',
    accent: '#a855f7',
  },
  technology: {
    category: 'technology',
    label: 'Technology strategy',
    outlookTitle: 'Technology Future Outlook',
    outlookDescription: 'A technical strategy brief covering platform direction, architecture risks, adoption trends, and innovation paths.',
    visual: '/topic-technology.svg',
    accent: '#34d399',
  },
  marketing: {
    category: 'marketing',
    label: 'Marketing growth',
    outlookTitle: 'Marketing Growth Outlook',
    outlookDescription: 'A growth brief focused on audience behavior, campaign direction, brand positioning, and market engagement.',
    visual: '/topic-marketing.svg',
    accent: '#f59e0b',
  },
  ecommerce: {
    category: 'ecommerce',
    label: 'E-commerce expansion',
    outlookTitle: 'E-commerce Future Outlook',
    outlookDescription: 'A retail strategy brief covering customer behavior, channel expansion, conversion risk, and growth opportunities.',
    visual: '/topic-ecommerce.svg',
    accent: '#38bdf8',
  },
  finance: {
    category: 'finance',
    label: 'Financial outlook',
    outlookTitle: 'Financial Future Outlook',
    outlookDescription: 'A financial planning brief focused on ROI, cost exposure, investment timing, and scenario-based decisions.',
    visual: '/topic-business.svg',
    accent: '#22c55e',
  },
  operations: {
    category: 'operations',
    label: 'Operational excellence',
    outlookTitle: 'Operations Future Outlook',
    outlookDescription: 'An operations brief covering efficiency, workflow design, process risk, and execution readiness.',
    visual: '/topic-business.svg',
    accent: '#6366f1',
  },
  general: {
    category: 'general',
    label: 'Strategic decision',
    outlookTitle: 'Strategic Future Outlook',
    outlookDescription: 'A strategic brief that turns the question into future signals, practical risks, and recommended next moves.',
    visual: '/topic-business.svg',
    accent: '#6366f1',
  },
};

const CATEGORY_KEYWORDS: Record<TopicCategory, string[]> = {
  ai: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'chatbot', 'automation', 'model'],
  technology: ['technology', 'software', 'cloud', 'saas', 'api', 'platform', 'infrastructure', 'data', 'cybersecurity'],
  marketing: ['marketing', 'brand', 'campaign', 'seo', 'social media', 'content', 'ads', 'customer acquisition'],
  ecommerce: ['ecommerce', 'e-commerce', 'retail', 'shop', 'checkout', 'marketplace', 'customer behavior'],
  finance: ['finance', 'financial', 'revenue', 'cost', 'roi', 'investment', 'pricing', 'profit', 'budget'],
  operations: ['operations', 'supply chain', 'process', 'workflow', 'productivity', 'efficiency', 'logistics'],
  general: [],
};

export function classifyTopic(text: string): TopicProfile {
  const lower = text.toLowerCase();
  let best: TopicCategory = 'general';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [TopicCategory, string[]][]) {
    const score = keywords.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0), 0);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  return TOPIC_PROFILES[best];
}

export function buildBusinessOutlook(prompt: string, synthesisText?: string): OutlookSection[] {
  const source = `${prompt}\n${synthesisText ?? ''}`;
  const profile = classifyTopic(source);
  const subject = prompt.trim().replace(/\s+/g, ' ').slice(0, 120) || 'this decision';

  const shared = {
    market: [
      `Demand will likely favor organizations that can turn "${subject}" into measurable customer or operational outcomes.`,
      'Buyers will expect clearer ROI, faster implementation cycles, and evidence-backed differentiation.',
      'The strongest market position will come from pairing speed with governance, trust, and repeatable delivery.',
    ],
    risks: [
      'Execution risk is highest where ownership, success metrics, or data quality are unclear.',
      'Competitors can copy surface-level features quickly, so durable advantage should come from workflow depth and customer insight.',
      'Adoption may slow if users do not understand the business value or if change management is underfunded.',
    ],
    strategy: [
      'Start with a focused pilot, define measurable success criteria, and scale only after validating usage and business impact.',
      'Create a decision dashboard that tracks cost, cycle time, quality, customer satisfaction, and strategic upside.',
      'Build feedback loops so product, operations, and leadership can adjust the roadmap based on real usage data.',
    ],
  };

  const byTopic: Record<TopicCategory, OutlookSection[]> = {
    ai: [
      {
        title: 'Market outlook',
        items: [
          'AI adoption is moving from experimentation to embedded business workflows, especially where automation reduces decision latency.',
          'Future value will concentrate around trusted AI systems with explainability, governance, and domain-specific context.',
          'Companies that combine human expertise with AI copilots will likely outperform teams using generic automation alone.',
        ],
      },
      {
        title: 'Growth opportunities',
        items: [
          'Package the solution as a decision-intelligence layer for teams that need faster strategic analysis.',
          'Create premium features around audit trails, confidence scoring, knowledge base grounding, and executive-ready summaries.',
          'Offer industry-specific templates for finance, product, marketing, operations, and technology leaders.',
        ],
      },
    ],
    technology: [
      {
        title: 'Technology outlook',
        items: [
          'Technology buyers will continue prioritizing platforms that reduce integration friction and improve operational resilience.',
          'Cloud-native, API-first, and analytics-driven products are positioned for stronger long-term adoption.',
          'Security, reliability, and total cost of ownership will remain key differentiators.',
        ],
      },
      {
        title: 'Innovation opportunities',
        items: [
          'Add workflow integrations, role-based dashboards, and reusable decision templates.',
          'Use telemetry to recommend next actions and identify bottlenecks across repeated decisions.',
          'Introduce collaboration features for teams to compare assumptions and outcomes over time.',
        ],
      },
    ],
    marketing: [
      {
        title: 'Market outlook',
        items: [
          'Marketing teams are shifting toward data-backed creative strategy and faster campaign experimentation.',
          'Personalized messaging and customer journey intelligence will drive stronger engagement.',
          'Brands that connect insight generation to execution workflows will gain speed and consistency.',
        ],
      },
      {
        title: 'Growth opportunities',
        items: [
          'Position the product as a campaign strategy simulator that tests messaging, risk, and ROI before launch.',
          'Add templates for go-to-market planning, positioning, audience segmentation, and competitive messaging.',
          'Surface insights as shareable executive briefs for stakeholders.',
        ],
      },
    ],
    ecommerce: [
      {
        title: 'Market outlook',
        items: [
          'E-commerce growth will be shaped by personalization, faster fulfillment expectations, and omnichannel experiences.',
          'Customer behavior is likely to reward brands that reduce friction and increase trust at checkout.',
          'Operational efficiency and retention will matter as acquisition costs remain volatile.',
        ],
      },
      {
        title: 'Competitive advantages',
        items: [
          'Use decision simulations to compare pricing, loyalty, merchandising, and fulfillment strategies.',
          'Develop insight modules around customer lifetime value, churn risk, and category expansion.',
          'Connect debate outputs to actionable tests such as A/B experiments and promotional calendars.',
        ],
      },
    ],
    finance: [
      {
        title: 'Market outlook',
        items: [
          'Decision-makers will prioritize initiatives with clear ROI, risk controls, and predictable cash-flow impact.',
          'Finance teams will value tools that convert strategic uncertainty into comparable scenarios.',
          'Capital allocation will favor options with measurable downside protection and scalable upside.',
        ],
      },
      {
        title: 'Strategic recommendations',
        items: [
          'Model best-case, base-case, and downside scenarios before committing resources.',
          'Track leading indicators so leadership can adjust investment before costs compound.',
          'Pair financial metrics with adoption and operational metrics for a complete view of value.',
        ],
      },
    ],
    operations: [
      {
        title: 'Market outlook',
        items: [
          'Operational teams will continue investing in automation, visibility, and process standardization.',
          'Efficiency gains will depend on aligning process redesign with employee adoption.',
          'Resilient operating models will balance speed, cost control, and quality assurance.',
        ],
      },
      {
        title: 'Innovation opportunities',
        items: [
          'Use debate templates to evaluate process changes before implementation.',
          'Add workflow scoring for cost, risk, complexity, and expected productivity impact.',
          'Create playbooks for recurring operational decisions and post-decision reviews.',
        ],
      },
    ],
    general: [
      {
        title: 'Future outlook',
        items: shared.market,
      },
      {
        title: 'Growth opportunities',
        items: [
          'Turn recurring decision patterns into reusable playbooks and templates.',
          'Create stakeholder-ready summaries that help teams move from analysis to execution.',
          'Differentiate through transparent reasoning, confidence scoring, and measurable outcomes.',
        ],
      },
    ],
  };

  return [
    ...byTopic[profile.category],
    {
      title: 'Potential risks',
      items: shared.risks,
    },
    {
      title: 'Recommended next moves',
      items: shared.strategy,
    },
  ];
}

export function outlookToSpeech(profile: TopicProfile, sections: OutlookSection[]) {
  return [
    `${profile.outlookTitle} for ${profile.label}.`,
    ...sections.flatMap(section => [
      section.title,
      ...section.items,
    ]),
  ].join(' ');
}
