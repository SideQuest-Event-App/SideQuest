# Instagram accounts

The business accounts the Instagram import reads. To add one, add a row with its handle and its venue's name (or "Promoter" if it has no single venue); to drop one, delete its row. The numbers are filled in by `node sketch-1/import/instagram.js` (last run 2026-11-25).

- **Venue**: events from the account's posts are placed here, unless a post names another venue. A new venue is found on the map by its name.
- **Posts read**: how many of its recent posts (the last 40, up to 60 days old) the AI has read.
- **Events found**: events the AI found in those posts, before the date window and the duplicate check.
- **Paused**: 20 of its recent posts were read with no event in them, so its new posts aren't read. It picks up again by itself as those posts drop out of its last 40.

| Account | Venue | Posts read | Events found | Note |
|---|---|---:|---:|---|
| [@thegarrisonto](https://www.instagram.com/thegarrisonto/) | The Garrison | 28 | 23 |  |
| [@backroomcomedyclub](https://www.instagram.com/backroomcomedyclub/) | Backroom Comedy Club | 0 | 0 |  |
| [@keyscomedyclub](https://www.instagram.com/keyscomedyclub/) | Key's Stand up Comedy Club Toronto Improv Bar and Grill | 0 | 0 |  |
| [@standardtime.to](https://www.instagram.com/standardtime.to/) | Standard Time | 14 | 20 |  |
| [@trackandfieldbar](https://www.instagram.com/trackandfieldbar/) | Track & Field | 10 | 9 |  |
| [@hardluckbar](https://www.instagram.com/hardluckbar/) | Hard Luck Bar | 11 | 5 |  |
| [@monarchtavern](https://www.instagram.com/monarchtavern/) | The Monarch Tavern | 1 | 0 |  |
| [@galleryarcturus](https://www.instagram.com/galleryarcturus/) | Gallery Arcturus | 4 | 0 |  |
| [@socapcomedy](https://www.instagram.com/socapcomedy/) | The Social Capital Theatre | 3 | 3 |  |
| [@rivolitoronto](https://www.instagram.com/rivolitoronto/) | Rivoli Toronto | 0 | 0 |  |
| [@gretabaryyz](https://www.instagram.com/gretabaryyz/) | GRETA Bar YYZ | 7 | 2 |  |
| [@wavelengthmusic](https://www.instagram.com/wavelengthmusic/) | Promoter | 6 | 4 |  |
| [@lulalounge](https://www.instagram.com/lulalounge/) | Lula Lounge | 6 | 7 |  |
| [@barcathedral](https://www.instagram.com/barcathedral/) | Bar Cathedral | 11 | 6 |  |
| [@mysttoronto](https://www.instagram.com/mysttoronto/) | Myst Toronto | 6 | 3 |  |
| [@solunatoronto](https://www.instagram.com/solunatoronto/) | Soluna Toronto | 7 | 0 |  |
| [@evergreencanada](https://www.instagram.com/evergreencanada/) | Evergreen Brick Works | 4 | 0 |  |
| [@sweetactiontheatre](https://www.instagram.com/sweetactiontheatre/) | Sweet Action Theatre | 3 | 11 |  |
| [@lavelletoronto](https://www.instagram.com/lavelletoronto/) | Lavelle | 12 | 0 |  |
| [@bombaesocial](https://www.instagram.com/bombaesocial/) | Bombae Social | 18 | 0 |  |
| [@houndstoothto](https://www.instagram.com/houndstoothto/) | Houndstooth | 9 | 4 |  |
| [@batashoemuseum](https://www.instagram.com/batashoemuseum/) | Bata Shoe Museum | 18 | 15 |  |
| [@nickel9distillery](https://www.instagram.com/nickel9distillery/) | Nickel 9 Distillery | 2 | 1 |  |
| [@canadianstage](https://www.instagram.com/canadianstage/) | Promoter | 0 | 0 |  |
| [@yogakawa](https://www.instagram.com/yogakawa/) | Promoter | 16 | 30 |  |
| [@thedrakehotel](https://www.instagram.com/thedrakehotel/) | The Drake Hotel | 16 | 25 |  |
| [@horseshoetavern](https://www.instagram.com/horseshoetavern/) | Horseshoe Tavern | 15 | 15 |  |
| [@leespalace](https://www.instagram.com/leespalace/) | Lee's Palace | 17 | 15 |  |
| [@historytoronto](https://www.instagram.com/historytoronto/) | HISTORY | 2 | 3 |  |
| [@masseyhall](https://www.instagram.com/masseyhall/) | Massey Hall | 0 | 0 |  |
| [@bovinesexclub](https://www.instagram.com/bovinesexclub/) | Bovine Sex Club | 11 | 5 |  |
| [@codatoronto](https://www.instagram.com/codatoronto/) | CODA | 6 | 9 |  |
| [@agotoronto](https://www.instagram.com/agotoronto/) | Art Gallery of Ontario | 8 | 1 |  |
| [@mocatoronto](https://www.instagram.com/mocatoronto/) | MOCA | 24 | 18 |  |
| [@harbourfrontcentre](https://www.instagram.com/harbourfrontcentre/) | Harbourfront Centre | 19 | 17 |  |
| [@tiff_net](https://www.instagram.com/tiff_net/) | TIFF Lightbox | 0 | 0 |  |
| [@revuecinema](https://www.instagram.com/revuecinema/) | Revue Cinema | 0 | 0 |  |
| [@baddogtheatre](https://www.instagram.com/baddogtheatre/) | Promoter | 0 | 0 |  |
| [@factorytheatre](https://www.instagram.com/factorytheatre/) | Factory Theatre | 9 | 7 |  |
| [@stacktmarket](https://www.instagram.com/stacktmarket/) | STACKT Market | 4 | 1 |  |
| [@societyclubhouse](https://www.instagram.com/societyclubhouse/) | Society Clubhouse | 0 | 0 |  |
| [@hendersonbrewing](https://www.instagram.com/hendersonbrewing/) | Henderson Brewing | 0 | 0 |  |
| [@thedakotatavern](https://www.instagram.com/thedakotatavern/) | The Dakota Tavern | 0 | 0 |  |
| [@jazzbistroto](https://www.instagram.com/jazzbistroto/) | Jazz Bistro | 0 | 0 |  |
| [@dromtaberna](https://www.instagram.com/dromtaberna/) | Drom Taberna | 0 | 0 |  |
| [@poetryjazzcafe](https://www.instagram.com/poetryjazzcafe/) | Poetry Jazz Cafe | 0 | 0 |  |
| [@scotiabankarena](https://www.instagram.com/scotiabankarena/) | Scotiabank Arena | 0 | 0 |  |
| [@listeningroomtoronto](https://www.instagram.com/listeningroomtoronto/) | Promoter | 0 | 0 |  |
| [@nina.philflow](https://www.instagram.com/nina.philflow/) | Promoter | 0 | 0 |  |
| [@futurenightlife](https://www.instagram.com/futurenightlife/) | Future | 0 | 0 |  |
| [@torontoshitshow](https://www.instagram.com/torontoshitshow/) | Promoter | 0 | 0 |  |
| [@theboardroom.cafe](https://www.instagram.com/theboardroom.cafe/) | Promoter | 0 | 0 |  |
| [@dancewithsandani](https://www.instagram.com/dancewithsandani/) | Promoter | 0 | 0 |  |
| [@thepilot_to](https://www.instagram.com/thepilot_to/) | The Pilot | 0 | 0 |  |
| [@rebeltoronto](https://www.instagram.com/rebeltoronto/) | REBEL | 0 | 0 |  |
| [@handlebar_to](https://www.instagram.com/handlebar_to/) | Handlebar | 0 | 0 |  |
| [@yukyukstoronto](https://www.instagram.com/yukyukstoronto/) | Yuk Yuk's Toronto | 0 | 0 |  |
| [@thesecondcity](https://www.instagram.com/thesecondcity/) | The Second City Toronto | 0 | 0 |  |
| [@soulpeppertheatre](https://www.instagram.com/soulpeppertheatre/) | Young Centre for the Performing Arts | 0 | 0 |  |
| [@crowstheatre](https://www.instagram.com/crowstheatre/) | Streetcar Crowsnest | 0 | 0 |  |
| [@mirvishproductions](https://www.instagram.com/mirvishproductions/) | Promoter | 0 | 0 |  |
