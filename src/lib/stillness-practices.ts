export type StillnessItem = {
  id: string;
  name: string;
  kind: string;
  duration: string;
  tags: string[];
  color: string;
  desc: string;
  steps: string[][];
  question: string;
  guidance?: {
    context: string[];
    paragraphs: string[];
    sources: { title: string; url: string }[];
    awayStep?: number;
  };
};

const tolle = { title: "Eckhart Tolle", url: "https://eckharttolle.com/free-resources/" };
const singer = { title: "Michael Singer", url: "https://tou.org/michael-singer-interviews/" };
const watts = { title: "Alan Watts", url: "https://alanwatts.com/collections/eastern-wisdom-collection/products/buddhist-taoist-meditation-remastered-audio-series" };

// Original practices. Spiritual context adds understanding, never a different action.
export const personalPractices: StillnessItem[] = [
  {
    id: "feeling-explanation", name: "The feeling and the explanation", kind: "Reminder", duration: "30 sec",
    tags: ["Fear", "Impulsiveness"], color: "green",
    desc: "When a feeling and the explanation for it seem like the same thing.",
    steps: [["Notice both", "The feeling is real. My explanation is something I can question.\n\nI can notice what I’m feeling and what my mind says it means. I don’t have to settle either immediately."]],
    question: "What am I feeling, and what am I assuming it means?",
    guidance: {
      context: ["Witnessing means noticing a thought without automatically treating it as an instruction. You can be aware of the feeling and the explanation without needing to become either."],
      paragraphs: [
        "This reminder invites two observations: what you feel, and what you believe caused it. Questioning the explanation does not make the feeling wrong or require it to disappear.",
        "In the language of presence, identification is becoming so absorbed in a thought that it seems like the whole truth. Witnessing offers a little room to examine it. These are spiritual teachings, rather than a claim about a proven mechanism.",
        "After a loss, you might notice disappointment alongside the thought ‘my entry must be wrong’. The disappointment is present; the explanation can be investigated later, rather than accepted or dismissed immediately.",
      ], sources: [tolle, singer],
    },
  },
  {
    id: "fix-a-loss", name: "When the mind wants to fix a loss", kind: "Sequence", duration: "5 min away + 2 min guided",
    tags: ["Fear", "Impulsiveness"], color: "purple",
    desc: "Step away from the charts first. Return to notice the feeling, explanation and urge without needing an immediate answer.",
    steps: [
      ["Step away first", "Notice the demand to find an explanation. Leave the charts for around five minutes. Walk, get some water, or move somewhere else. The question can remain unanswered while you are away."],
      ["Return when ready", "You are back at the practice. There is no need to return to trading. If you are still heated, take more time away. Continue when you want to notice what remains."],
      ["Notice the feeling", "Notice any emotion or physical sensation: tension, disappointment, warmth, or restlessness. Let your breathing find its own pace. Nothing has to change for you to observe it."],
      ["Notice the explanation", "What does your mind say this loss means? Notice the explanation as a thought. It may be accurate, incomplete, or coloured by this moment. You do not have to decide now."],
      ["Notice the urge", "Notice any pull to investigate, change something, or act again. Can the urge be here without becoming an instruction? Leave the question open for now. A factual review can have its own time later."],
    ],
    question: "What did I notice, and what can I leave unanswered for now?",
    guidance: {
      awayStep: 0,
      context: [
        "Presence can begin with stepping out of the situation. You do not have to force stillness while you are heated.",
        "Non-striving means you do not have to manufacture calm or reach a special state before continuing.",
        "Allowing means making room for what you notice, rather than demanding a different feeling.",
        "Identification can make ‘I need to fix this’ feel like a command. Witnessing means noticing that thought before following it.",
        "A thought can be present without directing your next action. This is an invitation to observe, not to suppress it.",
      ],
      paragraphs: [
        "This sequence separates a pause from technical review. It does not establish that a loss was random or that a trading model is valid. Evidence can still be reviewed later.",
        "Witnessing means noticing inner activity without immediately following it. Presence invites attention to what is happening now. Non-striving is a reminder that calm is not a performance requirement. These are perspectives to explore through your own experience.",
        "For example, after a loss you may repeatedly adjust an imagined stop placement. First leave the charts. On returning, notice the tension, the explanation ‘that stop was the problem’, and the urge to change it. None needs an immediate verdict.",
        "The break has no readiness score. Five minutes is an invitation, and you can take longer or end the practice. The practice never asks you to place a trade.",
      ], sources: [tolle, singer, watts],
    },
  },
  {
    id: "same-decision", name: "Same decision, different outcome", kind: "Practice", duration: "3 min",
    tags: ["Fear", "Greed"], color: "pink",
    desc: "When you are ready to reflect, examine the decision without letting the outcome set the whole standard.",
    steps: [
      ["Recall the decision", "Recall the information available at the time and the decisions you made. Leave out what you only learned afterwards."],
      ["Change only the outcome", "If this loss had won, or this win had lost, keep the same information and decisions in mind. Imagine only the result changing."],
      ["Notice the judgment", "Does your judgment of the decision change with the imagined result? Disappointment and excitement can differ. Your standard for the decision can stay consistent."],
      ["Recognise what deserves review", "What followed your plan, and what deserves a later factual review? A win does not erase a broken rule. A loss alone does not establish that the decision was wrong."],
    ],
    question: "What can I recognise about my decisions independently of the result?",
    guidance: {
      context: [
        "Presence invites attention to what was actually known, rather than a story built afterwards.",
        "You are observing how the mind gives meaning to a result, without needing to identify with that meaning.",
        "Witnessing allows the feeling and the judgment to be noticed separately. Neither has to disappear.",
        "Non-identification means a result need not become a verdict on who you are. Honest correction can still follow.",
      ],
      paragraphs: [
        "This is an original reflection about applying the same standards to wins and losses. Use it after the immediate intensity has eased, not as another demand to analyse while heated.",
        "Witnessing invites a distinction between your awareness and the thoughts passing through it. You can notice the judgment of a decision as it appears, without accepting it as the whole picture.",
        "A rule-breaking entry may win. Imagine it losing with exactly the same decisions: would you suddenly recognise the broken rule? Conversely, a loss need not erase the parts of a decision that followed your plan.",
        "The aim is consistent assessment, not identical emotions, proof of a valid model, or a requirement to feel proud.",
      ], sources: [tolle, singer],
    },
  },
  {
    id: "yesterday-today", name: "When yesterday enters today", kind: "Practice", duration: "2 min",
    tags: ["Fear", "Impatience"], color: "green",
    desc: "Notice a previous result colouring the present, without putting pressure on yourself to act.",
    steps: [
      ["Notice the memory", "Notice a previous result or decision appearing in your mind. A memory is here now; the earlier event is not happening again in this moment."],
      ["Notice what comes with it", "Observe any fear, tension, or expectation accompanying the memory. You do not have to argue with it or make it leave."],
      ["Return to what is here", "Notice contact with the floor, one sound, and something you can see. What can you directly observe in the present?"],
      ["Distinguish then from now", "What belongs to the remembered experience, and what is observable today? You can recognise both before choosing what to do. Waiting or stepping away remains available."],
    ],
    question: "What belongs to yesterday, and what can I observe today?",
    guidance: {
      context: [
        "Presence means recognising what is happening now, including the appearance of a memory.",
        "Witnessing lets you notice fear without turning it into your identity or a prediction.",
        "Body awareness offers a simple doorway into presence. No special sensation or state is required.",
        "Non-identification creates room to observe. It is not an instruction to overcome hesitation by taking a trade.",
      ],
      paragraphs: [
        "This practice invites you to distinguish a remembered experience from current observations. It does not erase memory or tell you to disregard useful information from the past.",
        "Body awareness offers a way to attend to the present. In this spiritual language, presence means attending to the current experience rather than being wholly absorbed in a remembered story.",
        "For example, yesterday’s loss may appear when you see a similar situation today. Notice the memory and tension, then return to what you can actually observe. This practice does not establish whether the situation meets your model.",
        "No action is required. Hesitation is not proof you should enter, and finishing is not a declaration of readiness.",
      ], sources: [tolle, singer],
    },
  },
];

export const defaultStillnessQuote = {
  text: "Stillness is a skill set, and understanding what stillness does and the effects of it at the proper time is many times that supercharge in understanding or healing.",
  attribution: "ICT — The Perspective From Above, 14 November 2026.",
};
