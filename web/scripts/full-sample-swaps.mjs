// The invented biology lesson that replaces the dev preview's real one in the
// home page's sample PDF (scripts/capture-full-sample.mjs). Every line the
// report shows from the lesson itself has an invented counterpart here; the
// report's own wording (headings, explanations, counts) is left as it is.
// When the preview fixture changes, rerun with DUMP=1 and cover the new lines.

export const SWAPS = {
  // Whole text nodes, matched exactly (whitespace collapsed).
  exact: {
    // Header
    'The decline and fall of the ancient Indian empires': 'Cellular respiration: where a cell’s energy comes from',
    'Preview Teacher ·': 'Biology ·',
    '· 7th': '· 9th',

    // Summary (the focus line is the hero's, scripts/capture-hero.mjs)
    'Your “bad choices vs. outside forces” framing gave students a strong lens.':
      'Your “what if the cell had no oxygen?” question got students reasoning.',
    'Have pairs sort the causes into those two groups before the simulation starts.':
      'After a student answers, ask one more “why?” before you move on.',
    'The lesson covers the decline and fall of ancient Indian empires—the Harappan (Indus River Valley), Mauryan, and Gupta civilizations—examining causes such as natural climate change, earthquakes, and rivers changing course, through reading passages and a simulation activity.':
      'The lesson covers cellular respiration — how cells turn glucose and oxygen into usable energy — moving from a modelled walk through the equation to small groups predicting what happens when oxygen runs short.',
    'Reviewing prior empire topics': 'Recapping photosynthesis',
    'Introducing the fall-of-empires simulation': 'Walking through the respiration equation',
    'Harappan decline reading and questions': 'Groups predicting a cell short of oxygen',
    'Based on the past, what do you think was the main cause for the fall of the bromine business?':
      'Why do you think the cell needs oxygen at the very end of the chain?',
    'Before explaining the simulation setup, ask pairs to predict one rule from the empires studied, then build your explanation around their answers.':
      'Before explaining the group task, ask pairs to predict which stage stops first without oxygen, then build your explanation around their answers.',
    'After the transitional-phrases question, add one follow-up "why does that phrase signal a cause?" before moving on.':
      'After the yeast question, add one follow-up "why does that make the dough rise?" before moving on.',
    'Grounding the Gupta "golden age" in concrete, memorable examples—zero as a number and rust-resistant iron—gives students tangible evidence rather than just a label, which helps the achievement actually stick before you pivot to decline.':
      'Building the equation up one molecule at a time — glucose in, oxygen in, then asking where the carbon goes — makes reactants and products something students track rather than copy down.',

    // Talk & Participation
    'Teacher talk ran well ahead of student talk in what the microphone caught, with several extended stretches of you explaining the simulation’s setup, task, and empires involved — explanatory talk rather than rapid-fire pacing.':
      'Teacher talk ran well ahead of student talk in what the microphone caught, with several extended stretches of you explaining the equation, the three stages, and the group task — explanatory talk rather than rapid-fire pacing.',
    'Students got the floor mainly through a couple of read-aloud moments and brief responses to direct questions; what else was said in partner work during the five-minute reading task is likely underrepresented here, since paired talk is hardest for a single microphone to pick up. This doesn’t tell us whether the room was quiet or simply out of the mic’s reach — only you know which.':
      'Students got the floor mainly through a couple of read-aloud moments and brief responses to direct questions; what else was said in group work during the prediction task is likely underrepresented here, since small-group talk is hardest for a single microphone to pick up. This doesn’t tell us whether the room was quiet or simply out of the mic’s reach — only you know which.',
    'Does anybody here wanna read, like, this little sentence up here real quick?': 'Can somebody read the equation on the board out loud for us?',
    'Turn to your neighbor and tell them which empire you think fell first.': 'Turn to your neighbor and tell them which stage you think stops first.',
    'So with that in mind, what do you think happened to the Moroccan civilization?': 'With that in mind, what happens inside a muscle cell during a sprint?',
    "Let's hear from someone who hasn't shared yet.": "Let's hear from a group we haven't heard from yet.",

    // Questioning & Checking
    'Of the 33 questions asked, several were invitations to read or volunteer rather than probes into content, and at least one placed the thinking back on you rather than leaving it with students — after asking “So what was it? So which two?” you supplied the answer yourself rather than waiting it out.':
      'Of the questions asked, several were invitations to read or volunteer rather than probes into content, and at least one placed the thinking back on you rather than leaving it with students — after asking “So which two go in? Which two?” you supplied the answer yourself rather than waiting it out.',
    // The fixture's note counts 33 questions and a wait under three seconds;
    // the report beside it shows 6 questions and TAWT 7.4 s.
    'With wait time averaging under three seconds, there’s limited room for a student to gather a fuller response before the question moves on or gets answered by you. It’s not clear from the recording how many of the 33 pushed into reasoning versus simply directing attention or inviting a reader.':
      'Where you did leave a pause, students had room to gather a fuller response before the question moved on. It’s not clear from the recording how many of your questions pushed into reasoning versus simply directing attention or inviting a reader.',
    '[name], what do you think is the meaning of the word abandoned?': '[name], what do you think the word aerobic means?',
    'Yeah. Natural climate change caused them to what?': 'Yeah. Without oxygen the cell switches to what?',
    'So of the six right here, which one would you think would fall under earthquakes?':
      'So which of the three stages would stop first if the oxygen ran out?',
    "So with that in mind, what do you think happened to the Moroccan civilization, or what's the most likely thing that happened to them?":
      'With that in mind, what do you think happens inside a muscle cell during a sprint, or what’s the most likely thing it does?',
    'So who here knows what a transitional phrase is?': 'So who can explain why yeast makes bread dough rise?',
    'So what was it? So which two?': 'So which two go in? Which two?',
    'Why do you think that happened?': 'Why do you think that is?',
    'So what does abandoned mean': 'So what does aerobic mean',
    'Can you say more about the trade routes?': 'Can you say more about where the carbon goes?',

    // Clarity & Content
    'So they created a number system that used zero as an actual number, and they created metal that was persistent to us.':
      'So the glucose gets split in half first, before any oxygen is even involved, and that split is glycolysis.',
    'Remember what we said about supply and demand last week.': 'Think about how your legs burn at the end of a sprint in gym.',
    'black death': 'glucose',
    wages: 'mitochondria',
    serf: 'ATP',
    'supply and demand': 'electron transport chain',
    feudalism: 'fermentation',
    'an iron that was a meter. No. Resistance of rust. Very good. So they created a number system that used zero as an actual number,…':
      'it ends up as carbon dioxide. Very good. So the glucose gets split in half first, before any oxygen is even involved,…',
    'The framing of internal bad choices versus external forces is a strong organizing lens for comparing why empires fall—next time you could have students sort the specific causes (climate shift, earthquakes, river course changes, leadership decisions) into those two buckets for each empire before the simulation starts, so the categories are active tools rather than background narration.':
      'The sprint example is a strong bridge to fermentation — next time you could have groups predict what a muscle cell does when oxygen runs short before you name lactic acid, so the idea comes from their reasoning rather than your explanation.',

    // Climate & Routines
    'Transitions were handled directly: when conversation got out of hand during partner work, you named it plainly (“Don’t wanna hear any more conversation”) and moved the group along rather than letting it stall the lesson. Directions were layered clearly, naming the task, steps, and timeframe together for the simulation.':
      'Transitions were handled directly: when conversation got out of hand during group work, you named it plainly (“Voices off while I explain”) and moved the class along rather than letting it stall the lesson. Directions were layered clearly, naming the task, steps, and timeframe together for the prediction task.',
    "So what we're gonna do, we're gonna have a little simulation. I'm gonna explain the rules in a bit. So, basically, just go over how all three of these empires fell. Then for today and tomorrow, we're gonna play a little game and see if you guys can run a simulation with one of the empires on how they fall and figure out which one it is.":
      "So here's what we're going to do. I'll hand out the cell cards in a second. Your group reads the three stages, then decides which one stops first when the oxygen runs out, and why. You've got ten minutes, and then one person from each group reports back.",
    'I don’t wanna start giving out DPSs.': 'I don’t want to start moving seats.',
    'Gotta keep it down, everybody.': 'Voices down, everybody.',
    'We’re not working together today.': 'This part is on your own, please.',
    'So, guys, why are we standing up and walking?': 'Folks, why are we up and walking around?',
    'Eyes up front, River.': 'Eyes up front, back table.',
    'Yeah. Natural climate change. So the main problem they came across was one.':
      'Yeah. Carbon dioxide. So the carbon leaves as a gas you breathe out.',
    'No. Disease had nothing to do with it. It was just climate change.': 'No. Light has nothing to do with it. That’s photosynthesis, not this.',
    'Being left behind. Very good.': 'Lactic acid. Very good.',

    // Content Specialist, printed after the Summary since 2026-11-02.
    "Your framing of internal choices versus external forces gave students a lens they could use: several answers reached for it on their own when explaining the Harappan decline.":
      "Your “what if the cell had no oxygen?” question gave students something to reason with: several answers reached for the oxygen at the end of the chain on their own when explaining fermentation.",
    "Next time, you could ask students to sort each cause into internal or external before the simulation starts, so the categories become tools they use while playing rather than a frame you narrate.":
      "Next time, you could follow one glucose molecule through each stage on the board, so students see where the energy actually leaves rather than reciting the equation.",
    "an iron that was a meter. No. Resistance of rust. Very good. So they created a number system that used zero as an actual number, and they created metal that was persistent to us. Harlem? Oh, I actually also said the":
      "so glucose comes in, oxygen comes in. Good. And then where does the carbon end up? Carbon dioxide, very good. So we're breathing out the carbon from the sugar we ate. Okay? Oh, I actually also said the",
    "Explicitly naming all three empires (Indus Valley, Mauryan, Gupta) right before launching the simulation is a nice anchor—it reminds students of the full set they're choosing among, which should make the \"figure out which one\" task more solvable.":
      "Naming all three stages — glycolysis, the Krebs cycle, the electron transport chain — right before the group task is a nice anchor: students know the full set they are reasoning across, which makes “which stage stops first?” more solvable.",
    "that simulated the fall of one of the major":
      "that walks through each of the three stages",
    "Empires fall for a variety of reasons. Sometimes leaders just make bad choices. Sometimes forces from outside the empire's control causes the empire to collapse. And in the case of the Indus River civilization, the Mauryans and the Gupta,":
      "Cells get their energy in a few different ways. Sometimes there's plenty of oxygen. Sometimes, like in a sprint, the muscle runs short. And in the case of the muscle cell, the yeast and the bacteria,",
    "Having students define \"abandoned\" is a good vocabulary check for the Harappan passage—you could extend it by asking whether the evidence suggests a sudden abandonment or a slow decline, since that distinction is central to how historians actually debate the Indus Valley's end.":
      "Having students define “ATP” in their own words is a good vocabulary check — you could extend it by tracking a single glucose molecule through each stage, so students see where the energy actually leaves.",
    "me. Circle one of the reasons for the decline of the empire. So what was the big one? And from the next part, a one two two essentially define the word abandoned. I'm gonna give you guys five minutes to just work on the Harappan part.":
      "me. Circle the stage that makes the most ATP. So what was the big one? And for the next part, number two, define ATP in your own words. I'm gonna give you guys five minutes to just work on the glycolysis part.",
    "When poetry comes up as a Gupta achievement, naming a specific example or figure could help it land alongside the more concrete items like zero and the iron pillar, so literature doesn't feel like a thinner category by comparison.":
      "When photosynthesis comes up in the recap, showing how the two equations mirror each other could help it land, so respiration doesn’t feel like a separate topic from the one students just finished.",
    "But about literature, I meant, like, mainly poetry. Yep. So you made a lot of poetry. We'll do Willow then.":
      "But about plants, I meant, like, mainly the leaves. Yep. So they make a lot of sugar. We'll do mitochondria then.",
    "Students often assume the Indus Valley decline was a single dramatic event (like an invasion) rather than a gradual process involving multiple environmental factors, so emphasizing the combination of causes over time helps correct that.":
      "Many students think plants photosynthesize instead of respiring; asking what a plant does at night surfaces the idea that plants respire all the time.",
    "Learners can conflate \"decline\" with \"disappearance,\" missing that Harappan culture and people likely persisted and dispersed rather than vanishing, which is worth distinguishing explicitly.":
      "Learners often treat energy as a substance stored inside ATP, so describing ATP as a carrier that moves energy, not the energy itself, is worth making explicit.",
    "Students sometimes assume all three empires fell the same way, so contrasting the specific mix of causes for each (climate/river shift for Indus, administrative overextension for Mauryan, invasions/fragmentation for Gupta) prevents a one-size-fits-all explanation.":
      "Students sometimes hear “respiration” as “breathing,” so separating the lungs’ gas exchange from the chemistry inside every cell prevents a one-word confusion.",
    "world history":
      "biology",

    // Talk & Participation's longest stretch, shown since the sample carries a
    // room trace (2026-11-02).
    "we're going to be doing another little simulation. This is going to be a two day thing. So":
      "we're going to be doing a little lab. This is going to be a two day thing. So",
    "this will take A day? Two day. I got it. Can pass out... Tell you what. You can pass out Can I pass out some?":
      "this will take a day? Two days. I got it. Can you pass out... Tell you what. You can pass out the yeast cups. Can I pass out some?",
    "This half of the room. So Not right now. So what we got... This will probably be done both today and tomorrow. What we're gonna do is that we're actually gonna look at a simulation":
      "This half of the room. So, not right now. So what we got... This will probably be done both today and tomorrow. What we're gonna do is that we're actually gonna look at a model",
    "Indian empires we talked about. We":
      "of the three stages we talked about. We",
    "talked about the Indus... Snow River Valley. We've talked about the Gupta, and we've talked about the Morians.":
      "talked about glycolysis... in the cytoplasm. We've talked about the Krebs cycle, and we've talked about the electron chain.",
    "So what we're gonna do Ow.":
      "So what we're gonna do, okay.",
    "Wait. Don't They're getting rid tires. Say he was kidding me. My Hell. Was this.":
      "Wait. Don't open those yet. They need to sit for a minute. Okay.",
    "So what we're gonna do, we're gonna have a little simulation. I'm gonna explain the rules in a bit. So, basically, just go over how all three of these empires fell. Then for today and tomorrow, we're gonna play a little game and see if you guys can":
      "So what we're gonna do, we're gonna have a little lab. I'm gonna explain the steps in a bit. So, basically, just go over how all three of these stages work. Then for today and tomorrow, we're gonna watch the yeast and see if you guys can",
    "run a simulation with one of the":
      "figure out which of the",
    "empires on how they fall and figure out which one it is. We'll go through the first part first, and then we will... Thank you. And then we will go through the simulation game. So first things first,":
      "three stages keeps running when the oxygen is gone. We'll go through the first part first, and then we will... Thank you. And then we will go through the lab. So first things first,",
    "is a packet that goes over the simulation. The front page should be a":
      "is a packet that goes over the lab. The front page should be a",
    "series of passages. So here are the rules. Oh my gosh.":
      "series of diagrams. So here are the steps. Okay.",
    "we're going to set the stage. Does anybody here wanna read, like, this little sentence up here real quick? Let's go. Hunter, go ahead. Throughout":
      "we're going to set the stage. Does anybody here wanna read, like, this little sentence up here real quick? Let's go. Go ahead. Throughout",
  },
  // Substrings, wherever they appear (a quote shown inside quotation marks).
  parts: [
    ['Introducing the fall-of-empires simulation', 'Walking through the respiration equation'],
    ['world history specialist', 'biology specialist'],
    ['Robert and Aramis, if I have to talk to you guys again, it’s going to be a DBS.', 'You two, if I have to stop again for the side conversation, you’ll be moving seats.'],
  ],
}

// The real lesson's words. None of them may be on the printed page.
export const LEAK =
  '\\b(empires?|Gupta|Harappan|Mauryan|Indus|bromine|Moroccan|simulation|transitional phrase|Robert|Aramis|Hunter|River|DBS|DPSs?|abandoned|feudalism|serfs?|black death|wages|supply and demand|climate change|zero|rust|earthquakes?|trade routes?|civilizations?)\\b'
