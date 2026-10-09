# Taylor's Logbook

## RUBRIC
- Reading → decision: **Each reading tied to a real team decision with insight**
- What I did: **Honest, specific account of your own role and growth**
- Systemic reflection: **Reasons about socio-technical and macro-economic implications of the project**
- An honest doubt: **Candid about uncertainty, mistakes, disagreement**
- AI use (disclose): **AI use for research or thinking is allowed and must be disclosed per entry.**



## Week 1 – Sept 10
- Reading → decision: N/A
- What I did:
    Set up GitHub for the team and linked it to VS Code.
    Created a simple logbook.md file.
- Systemic reflection:
    AI has a bad reputation among many people, and I fear that people may look at this project and think "Oh great, another AI app nobody asked for". I see a lot of cultural shame around AI use with regard to water use, environmental effects from datacenters, and overreliance, and want to understand how much impact even a smaller project like this would have. 
- An honest doubt: 
    While I have done coding projects with GitHub and AI chatbots, a project with this scope and timeframe feels kinda scary. I don't exactly understand what a sketch 0 is or how it should work, nor do I know what my group's project will be about, so I don't know where to start. I fear that this misunderstanding may lead us to fall behind and create an AI slop app that I'm not very proud of.
- AI use (disclose):
    Very minimal, Claude Code not yet set up. Asked Claude for clarification on what a Sketch 0 is and what it should look like

## Week 2 – Sept 17
- Reading → decision:
    With the North Star Playbook urging us to focus on a user-centred goal, we started with "Connecting users to other like-minded people through events in their area" and worked backwards to brainstorm the key inputs that can get us there, what opportunities arise here, and what interventions can help progress us.
- What I did:
    Dove deep into creating sketch 0 and linking Claude Code to catch the team up. I kept the functionality simple with the model "user provides a list of interests, and the app returns matching local events", and got Claude to generate all the code based on this. GitHub and Claude Code were not connected successfully, so I kept iterating on the output until there was a functional sketch live on the repo.
    Revised and updated sketch 0 based on a clear product strategy prompt, integrating friend, attendee, and review features to better showcase the scene and credibility around events. It now has default tag matching if the AI is not available too.
- Systemic reflection:
    With local event data needing to come from many sources, some of which may be very small-scale and hard to access, we will have to plan our sourcing well if we don't want to bias toward already-popular events. The point of this app is to curate toward more niche interests, so this may cause problems, especially since a lot of underground event promotion circulates on apps like Instagram, which we might not have access to.
    I feel like there may be a conflict of goals, where the beauty in a lot of these niche events comes from natural discovery or unexpected "hole in the wall" enjoyment. I would like for this app to move toward assistance rather than automation, so maybe some flexibility in suggestions would be nice
    With trust being a center piece in our project, there must be a balance of real-world integration and citations since AI involvement may lead people to think some things were hallucinated. We need real reviews.
- An honest doubt:
    During brainstorming, we all got really excited about this idea and started getting ideas for a fully-fledged app. I fear that our preconceptions and expectations may steer us off course and away from unbiased, data-based insights.
    I feel like this concept is great and needed, but the scope still feels very big, maybe too big. It seems like we have a comprehensive app in mind, and we might get "lost in the sauce" trying to balance features rather than support a simple golden path. I'm still curious to see how AI could simplify this, if it can.
- AI use (disclose):
    Used Claude chat to help me with setting up Claude Code, and got it to generate sketch 0 with sample event data after granting it access to my files. Also used it as an assistant during error debugging.
    Used it to assist in making the product strategy stronger for updating the sketch, and ot provided guidance on how to use claude code based on prompts like this, suggesting putting the strategy in CLAUDE.md and developing it from there.

## Week 3 – Sept 24
*what did you hear that you did not want to hear?*
- Reading → decision:
    Based on the opportunity tree reading, we consolidated the key parts of the interviews to establish a more solid, clear direction of the different paths we could take or things to include in our app, in a way that was higher-level and grounded in the interviews. I like the structured hierarchy aspect of opportunity trees, and the purpose-forward angle, since other thematic analysis tasks I've done were a lot more open-ended and purely focused on discovery, which can lead to weird organizational structures. Knowing that interview responses needed to relate to "connecting users to other like-minded people through worthwhile events in their area" and also present opportunities for our app created a solid lens for analysis and made it easier to find concrete answers.
- What I did:
    After working with the group to develop interview questions, I moderated an interview with a participant who doesn't really go out much. I transcribed this interview and then asked Claude to generate the key points, needs, pains, desires, and key assumptions not backed by quotes. From this, I made an opportunity tree from each problem, and consolidated it with the one from Amy's interview to find the strongest crossover points.

    It was revealed that both partcipants cared a lot about location, not wanting to travel very far for events, so I asked Claude to add location features to sketch-0 to inform the users. This sketch-0 was still very plain and flat, not very organized into a proper app yet, but contained the foundational aspects that our app should push forward. I guess I didn't really feel like this step made the app evolve, and rather just felt like an extra feature that got tacked onto the app, but I think that's also because Claude did a lot of the heavy lifting for integration.
- Systemic reflection:
    This project so far has had a very fast pace, and I feel like a lot of corners are being cut, which I guess may be the point. With AI speeding up the process and gathering a growing trust in the general population, I think it's becoming more encouraged to just move forward and not fully understand and sit with the information you have. I would have liked to really understand both interviews in and out and discuss opportunities and methods as a team before going to AI assistance. I feel like this may have effects on overall creativity and risk-taking, since having a basis on aggregate data will give you aggregate results. I think I'll need to find more ways to bring my insight into the project and move forward alongside the AI, which I guess I could have been doing more of all along.
- An honest doubt:
    With the interviews, we were unable to do a proper screener, and the participants likely would not find much use in our app. They either like very large-scale events or don't go out at all, only being prompted by friends. The last thing I wanted to hear was something along the lines of "I don't really care to go out much". While these insights are beneficial regardless, and do mention key points about what encourages people to go out (like celebrities or artists in town) and what barriers prevent them from going out (distance), it may not have the same priority as something said by our ideal user. With so many moving parts in this assignment, it also feels like we're doing things that may have been based on assumptions/preconceptions or AI hallucinations, and it's hard to pinpoint where everything is coming from and where it is grounded in research. I think this could be mitigated by organizing the Claude prompts a bit better and having clearer skills for reference, just to make the links a bit clearer.
- AI use (disclose):
    Used Otter.ai for transcription and Claude for the interview synthesis, opportunity tree, and consolidated opportunity tree (from both interviews, the other interview had an individual opportunity tree already). I also asked it to suggest potential app features, of which I sorted through and asked it to implement a select few of them to support location-informed search. As mentioned before, Claude did most of the heavy lifting with implementing this feature. Location-based search is pretty standard in most apps, so I didn't feel the need to fully define what that would look like for our app, because I assumed it would just be another data point that would help search refinement and algorithmic suggestions.


## Week 4 – Oct 1
- Reading → decision:
    The systems reading was pretty insightful regarding the concerns I had last week. Its emphasis on the interconnectedness of parts, inflow, and outflow made it a bit more clear how we could clean up the process and have everything grounded in data. I wanted to be able to clearly map the outflow to parts of the inflow, and also improve the app so we had an actual build. Since we were also bringing forward a more polished prototype, we decided to leverage skills a bit more to bring more design-forward inflow.
- What I did:
    With Asia generating a wireframe that was much more actualized, I got Claude to combine my sketch-0 and her "SideQuest" so that there was a solid interface that was integrated with AI-based search and an actual events database. At the same time, I got Claude to scrape the next 4 months of events that are publically available on platforms like EventBrite, TicketMaster, DICE, Resident Advisor, and Partiful so that our events database was grounded in reality.

    I think this week it became a lot more clear what we should be doing. We really are skipping the whole ideation-before-prototyping stream and are instead allowing there to be a messy prototype that can be refined based on what we deem to be necessary. I made sure to keep things as bare bones as possible so there wasn't so much cutting back, because the real hurdle is just getting the prototype built in the first place; I still wanted the creative freedom of how the app should look and feel. While Claude did generate task flows, I think they need to be refined quite a bit
- Systemic reflection:
    I guess it's kind of scary that Claude is doing a lot of the tedious work that I do actually love in design. I'm a systems thinker and can thrive on technical, thought-heavy, robotic work. I think the work is just changing and this systems thinking can be applied elsewhere, like prompt engineering and prototype refinement, since Claude isn't able to magically perfectly make whatever we're asking it to.

    I think in this process it is very easy to let Claude do all the work and be satisfied with the outputs because they were made very easily and look great, but the result can still be super messy. It's clear how open-ended or abstract inputs can lead to disjointed or unwanted results, and I think a lot of people who might be using this technology in the future will not fully understand that. I expect there to be a sort of democratization of app development similar to the rise of AI-generated restaurant art, where people will be doing it when it's not fully necessary, and are amazed by the output enough to not question it, which will result in a huge bloat of unnecessary apps with flows that are either super streamlined in the exact same way or full of unnecessary features. It's still important to know what you want and be able to provide that to these AI tools!
- An honest doubt:
    One disagreement my group had was related to everybody being able to build. There's a lot of weight in having a fully-fledged prototype, so when two people are in different directions it feels like there's a lot at stake. Asia created SideQuest, and without knowing exactly where she was coming from or where she based her inputs, I expressed my concerns that we were moving too fast and I was nervous that our decisions aren't necessarily grounded in our research. I'm glad I kept this conversation super honest, because she happily explained her process and showed me the documents where she based everything off of, which I failed to read beforehand (whoops).

    On my end, I let Claude do a lot of the heavy lifting when combining my sketch-0 with SideQuest, and naively prompted it with the assumption that it knew what I was talking about. This was fine for a couple iterations on sketch-0, but when I made sketch-1, it became very clear how my prompts created some bottlenecks or difficulties for the system. Specifically, the scraping system was very inefficient, specifically for EventBrite, which had rate limits. This overall process used up A LOT of tokens, and each iteration was around 30 minutes of processing on Claude's end. Yikes! With my usage being eaten away, I knew I needed to get a bit better at knowing what I was asking for and really working in smaller steps.
- AI use (disclose):
    Decided this stage of the process would just be exploration of "full speed ahead!" to see what a full, actualized app would look like. I asked Claude to combine SideQuest's interface with some key features in my sketch-0 and real Toronto events, with the expectation of it being bloated and not fully developed. It took a few tries to get it to work right, since the first result was not what I asked for, but the end result was only okay.

## Week 5 – Oct 8
- Reading → decision:
- What I did:
    This week, I made sure to fully go through my team's prototypes and documents so I would be familiar with their versions and how they got there. There's still a lot going on and a lot to account for, but that's the cost of this project!
- Systemic reflection:
- An honest doubt:
- AI use (disclose):

## Week 6 – Oct 15
- Reading → decision:
- What I did:
- Systemic reflection:
- An honest doubt:
- AI use (disclose):

## Week 7 – Oct 22
- Reading → decision:
- What I did:
- Systemic reflection:
- An honest doubt:
- AI use (disclose):