export const openAwareness = [
  "Notice contact with the chair and floor.",
  "Notice a thought without solving it.",
  "Notice any urge to act.",
  "Allow the experience to be here.",
];

// Persisted choices refer to catalogue IDs and step indexes. Keep both stable.
export const catalogue = [
  {
    id: "waiting",
    name: "Make room for waiting",
    kind: "Sequence",
    duration: "3 min",
    tags: ["Impatience", "Impulsiveness"],
    color: "purple",
    desc: "When you feel pulled to act, make a little space between the urge and your next decision.",
    steps: [
      [
        "Arrive in your body",
        "Feel your feet resting on the floor. Notice the support of the chair. You do not need to change anything yet.",
      ],
      [
        "Let the urge be here",
        "The urge to act is something you can notice before it becomes something you follow. Let it be present for a moment.",
      ],
      [
        "Return to choice",
        "What would help you wait for a decision you actually want to make? You can act, wait, or step away.",
      ],
    ],
    question: "What did you notice between the urge and your next choice?",
  },
  {
    id: "release",
    name: "Leave the result here",
    kind: "Sequence",
    duration: "4 min",
    tags: ["Fear", "Greed"],
    color: "pink",
    desc: "A gentle close to the day, with room for the result and the person behind it.",
    steps: [
      [
        "The day can end",
        "Feel your feet on the floor. The session is finished. Nothing needs to be solved in this minute.",
      ],
      [
        "Separate the result from yourself",
        "A result is something that happened. It does not have to become a verdict about you.",
      ],
      [
        "Carry one thing forward",
        "What is one thing you want to keep, and one thing you are ready to put down?",
      ],
    ],
    question:
      "What can you leave here, and what would you like to carry forward?",
  },
  {
    id: "body",
    name: "Back to the room",
    kind: "Practice",
    duration: "1 min",
    tags: ["Fear", "Impulsiveness"],
    color: "green",
    desc: "A simple grounding practice. No breath holds, no particular feeling required.",
    steps: [
      [
        "Back to the room",
        "Notice one thing you can see, one thing you can hear, and the contact of your feet with the floor.",
      ],
    ],
    question: "What is here now that you have paused?",
  },
  {
    id: "enough",
    name: "Enough is a choice",
    kind: "Reminder",
    duration: "20 sec",
    tags: ["Greed", "Impatience"],
    color: "pink",
    desc: "A few words for the moment when you want just a little more.",
    steps: [
      [
        "Enough is a choice",
        "You can want more and still respect the limits you chose. You do not need to act on every possibility.",
      ],
    ],
    question: "What would respecting enough look like today?",
  },
  {
    id: "awareness",
    name: "Open awareness",
    kind: "Practice",
    duration: "2 min",
    tags: ["Fear", "Impatience"],
    color: "purple",
    desc: "Notice what is here and give yourself time before deciding what to do.",
    steps: [["Notice, without solving", openAwareness.join(" ")]],
    question: "What did you notice without needing to solve it?",
  },
  {
    id: "identity",
    name: "More than this moment",
    kind: "Reminder",
    duration: "20 sec",
    tags: ["Fear", "Impulsiveness"],
    color: "green",
    desc: "A reminder that a single decision does not describe all of you.",
    steps: [
      [
        "More than this moment",
        "Describe the behaviour precisely. Leave your identity out of the verdict. You are allowed to learn without making yourself the problem.",
      ],
    ],
    question: "What happened, described without judging who you are?",
  },
];
