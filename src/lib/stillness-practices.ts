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
    pauseSeconds?: number[];
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
    desc: "Revisit how a trade actually ended, feel the opposite ending, and see what stays true about your decision.",
    steps: [
      ["Recall the real decision", "Bring one trade to mind. Return to what you knew then, what you saw in the setup and what you actually chose. Now remember the instant you saw the result.\n\nStay with that first reaction for a few breaths. Where do you feel it? Give it a little time before telling yourself what it means."],
      ["Change only the outcome", "Keep the setup, information and every decision exactly as they were. If the trade lost, picture watching it hit your target. If it won, picture watching it hit your stop. Let yourself see that moment play out.\n\nSpend a little time in this version. Notice whether relief, tension, disappointment, excitement or something else shows up. You can stay with it for a few breaths."],
      ["Notice the judgment and come back", "What do you say about yourself or your decision in each version? Give each judgment a moment to be heard.\n\nLet the imagined ending fade. Feel your feet on the floor. Remember how the trade actually ended. Can you let this be how today ended, just for this breath?"],
      ["Recognise what deserves review", "What can you say about how you traded that would be true in either ending? You may have followed your plan and lost. You may have broken a rule and won. Name whatever you can say about your decision without the result deciding it for you.\n\nIf something needs a factual review, give it its own time later. For now, take one breath with the real ending."],
    ],
    question: "What can I say about how I traded that would be true in either ending?",
    guidance: {
      pauseSeconds: [35, 45, 35, 30],
      context: [
        "As you remember the moment, notice that the reaction you are feeling belongs to this breath. The trade is over, and the memory is here now.",
        "You can watch your mind give the same decision a different meaning as the picture changes. Give yourself a moment to notice that happening.",
        "There is room to hear the judgment as it comes up. Feel the floor again and notice what is here when you leave the imagined scene.",
        "You can witness disappointment or satisfaction while still looking plainly at the choice you made. Give both a place for this breath.",
      ],
      paragraphs: [
        "The two endings give you time to notice how a result can change the feeling and the story about the same choice. Coming back to the real ending gives you a moment to meet what actually happened.",
        "In the language of presence, witnessing means hearing the judgment while it is being made. You can feel the loss and still look at the decision clearly later. A factual review has its own time and its own evidence.",
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
  {
    id: "feels-personal", name: "When it feels personal", kind: "Practice", duration: "3 min",
    tags: ["Fear", "Impulsiveness"], color: "green",
    desc: "When you feel like a victim of price, blame yourself for what happened, or wish the day had gone differently.",
    steps: [
      ["Hear the sentence", "“Why does this always happen to me?” “Price took me out and then went exactly where I thought it would.” “I’ve done this to myself again.”\n\nLet your own sentence come through in the words you would actually use. Which part of it hurts? Take a few breaths and listen."],
      ["Notice the part that feels wronged", "Try saying quietly, “A part of me feels wronged by what happened,” or “A part of me is angry with me.” Use whichever fits, or put it your own way.\n\nGive that part a moment to speak. Notice how it feels to hear it. The feeling can stay just as strong."],
      ["Practise acceptance in this moment", "Feel the weight of your body on the chair or your feet on the floor. If you hear “I’ll be okay with this tomorrow,” try giving what is here today room for one breath.\n\nThis is what happened. This is how it feels right now. You can say both and still wish it had gone differently."],
      ["Return to choice", "Perhaps there is a decision to own. Perhaps you followed your plan and dislike the result. What do you know happened? What can you choose now? What can wait?\n\nGive yourself a little time before answering. You can close the charts with something still unresolved."],
    ],
    question: "What do I know happened, what can I choose now, and what can wait?",
    guidance: {
      pauseSeconds: [35, 40, 35, 30],
      context: [
        "Even as a part of you says “this shouldn’t have happened,” you can hear it saying that. Take a moment to notice the sound of the thought in your own words.",
        "Let that part finish its sentence. Rest briefly in the experience of hearing it, with whatever feeling is there.",
        "The feeling, the chair and the thought about tomorrow are all here to be noticed now. Stay with what you can feel for one breath.",
        "Notice the part of you that still wants a different ending. Give it room while you feel your hand resting on the desk or in your lap. The next choice can be small.",
      ],
      paragraphs: [
        "A part of you may be making a case for why the day should have gone differently. While that is happening, you can also hear the case being made. The practice gives you a few breaths to stay with that experience.",
        "Acceptance here is the simple recognition that this happened and this is how it feels in this moment. You can acknowledge it with the hurt still present, and choose what to do with the rest of your day.",
      ], sources: [],
    },
  },
];

export const defaultStillnessQuote = {
  text: "Stillness is a skill set, and understanding what stillness does and the effects of it at the proper time is many times that supercharge in understanding or healing.",
  attribution: "ICT — The Perspective From Above, 14 November 2026.",
};
