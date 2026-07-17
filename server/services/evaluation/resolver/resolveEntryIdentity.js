const { fetchCharacterInfo } = require('../../../evaluator');
const { normalizeName, canonicalizeName, resolveLikelyTypo } = require('../../../evaluator/core/textUtils');
const { MIN_INFO_CONFIDENCE, CHARACTER_NAME_ALIASES } = require('../../../evaluator/core/constants');
const { validateInput } = require('../../../evaluator/core/validation');
const {
  fetchFromWikipediaEnhanced,
  fetchFromWikipediaSearchEnhanced,
  fetchFromWikipediaSummary
} = require('../../../evaluator/core/fetchers');
const {
  lookupExternalEntityFact,
  shouldTryExternalFactEnrichment,
  mergeExternalFactIntoInfo
} = require('../../externalEntityFactsService');

const IMAGE_BACKFILL_CACHE = new Map();
const IMAGE_BACKFILL_INFLIGHT = new Map();
const IMAGE_BACKFILL_TTL_MS = 30 * 60 * 1000;
const IMAGE_BACKFILL_TIMEOUT_MS = Math.max(250, Number(process.env.CONTEXT_IMAGE_BACKFILL_TIMEOUT_MS) || 1500);
const ROUND_RESOLVE_TIMEOUT_MS = Math.max(400, Number(process.env.CONTEXT_ROUND_RESOLVE_TIMEOUT_MS) || 1600);
const ROUND_ALIAS_OVERRIDE_TIMEOUT_MS = Math.max(250, Number(process.env.CONTEXT_ROUND_ALIAS_TIMEOUT_MS) || 500);
const FINAL_IDENTITY_UPGRADE_TIMEOUT_MS = Math.max(300, Number(process.env.CONTEXT_FINAL_IDENTITY_UPGRADE_TIMEOUT_MS) || 900);
const FINAL_SYNTHETIC_UPGRADE_TIMEOUT_MS = Math.max(300, Number(process.env.CONTEXT_FINAL_IMAGE_UPGRADE_TIMEOUT_MS) || 900);
const EXTERNAL_FACT_ENRICH_TIMEOUT_MS = Math.max(200, Number(process.env.CONTEXT_EXTERNAL_FACT_TIMEOUT_MS) || 500);
const CONTEXT_EXTERNAL_FACT_ENRICH_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.CONTEXT_EXTERNAL_FACT_ENRICH_ENABLED || 'true').toLowerCase()
);
const CONTEXT_SYNTHETIC_IMAGE_FALLBACK = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.CONTEXT_SYNTHETIC_IMAGE_FALLBACK || 'true').toLowerCase()
);
const FAST_ROUND_GENERIC_NAME_SKIP_ALIAS = new Set([
  'joe', 'bob', 'sam', 'max', 'fred', 'john', 'bill', 'steve'
]);
const GENERIC_NAME_AMBIGUITY_FALLBACK = new Set([
  'joe', 'bob', 'sam', 'max', 'fred', 'john', 'bill', 'steve', 'larry', 'jimmy'
]);
const RESOLVER_ABBREV_EXPANSIONS = {
  mt: 'mount',
  mts: 'mounts',
  got: 'game of thrones',
  rdr2: 'red dead redemption 2',
  tmnt: 'teenage mutant ninja turtles',
  n64: 'nintendo 64',
  crt: 'cathode ray tube',
  lcd: 'liquid crystal display',
  tv: 'television',
  ufo: 'unidentified flying object',
  cpu: 'central processing unit',
  pbj: 'peanut butter and jelly',
  bts: 'bts',
  kfc: 'kentucky fried chicken',
  bmo: 'bmo adventure time',
  imax: 'imax',
  xbox: 'xbox',
  ps: 'playstation'
};
const RESOLVER_QUOTE_ALIAS_OVERRIDES = {
  winteriscoming: ['Game of Thrones', 'House Stark'],
  maytheodds: ['The Hunger Games', 'Katniss Everdeen'],
  toinfinity: ['Buzz Lightyear', 'Toy Story'],
  iaminevitable: ['Thanos'],
  yabbadabbadoo: ['The Flintstones', 'Fred Flintstone'],
  bazinga: ['Sheldon Cooper', 'The Big Bang Theory'],
  hakunamatata: ['The Lion King'],
  saymyname: ['Walter White', 'Breaking Bad'],
  hellothere: ['Obi-Wan Kenobi'],
  dracarys: ['Daenerys Targaryen', 'Game of Thrones']
};
const RESOLVER_MONIKER_OVERRIDES = {
  therock: ['Dwayne Johnson'],
  thedoctor: ['Doctor Who', 'The Doctor (Doctor Who)'],
  thegoat: ['Goat', 'Greatest of all time', 'GOAT'],
  thedarkknight: ['Batman', 'The Dark Knight'],
  thecapedcrusader: ['Batman'],
  cap: ['Captain America', 'Cap (disambiguation)'],
  capamerica: ['Captain America'],
  capshield: ['Captain America', "Captain America's shield"],
  mrbeast: ['MrBeast', 'Jimmy Donaldson'],
  mrstark: ['Tony Stark'],
  voldy: ['Lord Voldemort', 'Voldemort'],
  mando: ['Din Djarin', 'The Mandalorian'],
  obiwan: ['Obi-Wan Kenobi'],
  thorshammer: ['Mjolnir'],
  thorsaxe: ['Stormbreaker'],
  thewatcher: ['Watcher (comics)', 'Uatu'],
  thebat: ['Batman'],
  thebatfamily: ['Batman Family'],
  thebatsymbol: ['Bat-Signal'],
  thebatsignal: ['Bat-Signal'],
  girlfromhungergameswithbow: ['Katniss Everdeen', 'The Hunger Games'],
  theofficebossguy: ['Michael Scott', 'The Office (American TV series)']
};
const RESOLVER_OBJECT_TERMS = new Set([
  'sword', 'shield', 'trident', 'hammer', 'axe', 'helmet', 'ring', 'gauntlet', 'throne', 'crown', 'castle',
  'wand', 'ball', 'orb', 'device', 'watch', 'omnitrix', 'pokeball',
  'express', 'bus', 'car', 'truck', 'knife', 'rice', 'roll', 'sandwich', 'bowl', 'shop', 'planet', 'room', 'map'
]);
const RESOLVER_FOOD_TERMS = new Set([
  'pizza', 'sushi', 'ramen', 'taco', 'burrito', 'nacho', 'cheesecake', 'cookie', 'cake', 'latte', 'mochi', 'donut',
  'bagel', 'pocket', 'nugget', 'sandwich', 'ribs', 'shawarma', 'fries', 'rice', 'salad', 'sauce', 'cheetos',
  'whopper', 'churro', 'milkshake', 'ramen', 'fudge', 'hotpot', 'quinoa', 'oatmeal', 'sake', 'sriracha'
]);
const RESOLVER_PLACE_TERMS = new Set([
  'mount', 'mt', 'mountain', 'peak', 'summit', 'camp', 'base', 'castle', 'city', 'river', 'waterfall', 'lab',
  'citadel', 'jungle', 'mines', 'border', 'throne', 'room', 'greece', 'myth', 'desert', 'underworld'
]);
const IMAGE_BACKFILL_ALIAS_HINTS = {
  btd: ['Bloons Tower Defense', 'Bloons TD'],
  socererstrange: ['Doctor Strange', 'Doctor Strange (character)'],
  sorcererstrange: ['Doctor Strange', 'Doctor Strange (character)'],
  omniman: ['Omni-Man'],
  ghostbusters: ['Ghostbusters'],
  ghostbuster: ['Ghostbusters'],
  fortnite: ['Fortnite Battle Royale', 'Fortnite'],
  sungjinwoo: ['Sung Jin-woo', 'Sung Jin-Woo', 'Solo Leveling'],
  swiper: ['Swiper (Dora the Explorer)', 'Swiper'],
  alien: ['Xenomorph', 'Alien (film)', 'Alien'],
  superman: ['Superman', 'Superman (character)'],
  blackwidow: ['Black Widow (Natasha Romanova)', 'Black Widow (Marvel Comics)', 'Black Widow (2021 film)'],
  kimpossible: ['Kim Possible (character)', 'Kim Possible'],
  peach: ['Princess Peach', 'Peach'],
  princesspeach: ['Princess Peach', 'Princess Peach (character)', 'Mario'],
  robin: ['Robin (DC Comics)', 'Robin', 'Nico Robin (One Piece)', 'Nico Robin'],
  clarkkent: ['Superman', 'Clark Kent'],
  elderwand: ['Elder Wand', 'The Elder Wand'],
  mjolnir: ['Mjölnir', 'Mjolnir'],
  omnitrix: ['Omnitrix', 'Ben 10'],
  pokeball: ['Poké Ball', 'Poke Ball'],
  momoavatar: ['Momo (Avatar: The Last Airbender)', 'Momo (Avatar)'],
  ldeathnote: ['L (Death Note)', 'L'],
  nicorobin: ['Nico Robin (One Piece)', 'Nico Robin', 'One Piece'],
  hulk: ['Hulk (Marvel Comics)', 'Hulk', 'Bruce Banner'],
  thehulk: ['Hulk (Marvel Comics)', 'Hulk', 'The Incredible Hulk'],
  brucebanner: ['Bruce Banner', 'Bruce Banner (Marvel Cinematic Universe)', 'Hulk (Marvel Comics)'],
  kratos: ['Kratos (God of War)', 'Kratos'],
  kratosgodofwar: ['Kratos (God of War)', 'God of War'],
  baki: ['Baki Hanma', 'Baki the Grappler', 'Baki'],
  bakihanma: ['Baki Hanma', 'Baki the Grappler', 'Baki'],
  itadoriyuji: ['Yuji Itadori', 'Itadori Yuji', 'Jujutsu Kaisen'],
  yujiitadori: ['Yuji Itadori', 'Itadori Yuji', 'Jujutsu Kaisen'],
  dexter: ['Dexter (TV series)', "Dexter's Laboratory", 'Dexter Morgan'],
  jesuschrist: ['Jesus', 'Christ', 'Jesus Christ'],
  shaggy: ['Shaggy Rogers', 'Scooby-Doo', 'Norville Rogers'],
  scooby: ['Scooby-Doo', 'Scooby-Doo (character)', 'Scooby'],
  sanji: ['Sanji (One Piece)', 'Vinsmoke Sanji', 'One Piece'],
  daffyduck: ['Daffy Duck', 'Looney Tunes'],
  deadspoetssociety: ['Dead Poets Society'],
  deadpoetssociety: ['Dead Poets Society'],
  deadspoetsociety: ['Dead Poets Society', 'Robin Williams'],
  charlote: ['Charlotte'],
  drsuess: ['Dr. Seuss'],
  edgarallenpoe: ['Edgar Allan Poe'],
  galielo: ['Galileo Galilei'],
  bugsbunny: ['Bugs Bunny', 'Looney Tunes'],
  steve: ['Steve Jobs', 'Steve (Minecraft)', 'Steve'],
  luffygear5: ['Monkey D. Luffy', 'One Piece'],
  tonystark: ['Tony Stark', 'Iron Man', 'Iron Man (Tony Stark)'],
  reedrichards: ['Mister Fantastic', 'Reed Richards'],
  reedrichard: ['Mister Fantastic', 'Reed Richards'],
  spiderman: ['Spider-Man', 'Peter Parker (Marvel Cinematic Universe)', 'Spider-Man (character)'],
  ironman: ['Iron Man (character)', 'Iron Man', 'Tony Stark'],
  gandalf: ['Gandalf', 'Gandalf (Middle-earth)', 'The Lord of the Rings'],
  beethoven: ['Ludwig van Beethoven', 'Beethoven'],
  mozart: ['Wolfgang Amadeus Mozart', 'Mozart'],
  hellokitty: ['Hello Kitty'],
  masterchief: ['Master Chief (Halo)', 'Master Chief', 'Halo (franchise)'],
  pinkpanther: ['Pink Panther (character)', 'The Pink Panther', 'Pink Panther'],
  shangchi: ['Shang-Chi', 'Shang-Chi (Marvel Cinematic Universe)'],
  cristianoronaldo: ['Cristiano Ronaldo'],
  elvispresley: ['Elvis Presley'],
  captainamerica: ['Captain America (Marvel Comics character)', 'Steve Rogers (Marvel Cinematic Universe)', 'Captain America'],
  thanos: ['Thanos', 'Thanos (Marvel Cinematic Universe)'],
  tombraider: ['Lara Croft', 'Tomb Raider'],
  tuffpuppy: ['T.U.F.F. Puppy', 'Tuff Puppy'],
  joe: ['Joe (singer)', 'Joe Biden', 'Joe'],
  sam: ['Samwise Gamgee', 'Sam (singer)', 'Sam'],
  fred: ['Fred Flintstone', 'Fred'],
  jimmy: ['Jimmy Neutron', 'Jimmy'],
  saber: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
  saberfatestay: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
  saberfatestaynight: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
  joanofarc: ['Joan of Arc'],
  kinghenry: ['Henry VIII of England', 'Henry V of England'],
  guts: ['Guts (Berserk)'],
  theflash: ['The Flash (Barry Allen)', 'The Flash'],
  reinhart: ['Reinhardt (Overwatch)', 'Reinhard von Lohengramm', 'Reinhardt'],
  goku: ['Goku', 'Son Goku', 'Dragon Ball'],
  max: ['Max (given name)', 'Max'],
  bob: ['Bob the Builder', 'Bob (given name)', 'Bob'],
  dannyphantom: ['Danny Phantom'],
  ishigamisenku: ['Senku Ishigami', 'Dr. Stone'],
  drstone: ['Senku Ishigami', 'Dr. Stone'],
  batman: ['Batman', 'Batman (Bruce Wayne)'],
  truedetective: ['True Detective'],
  joedimiggio: ['Joe DiMaggio'],
  einstein: ['Albert Einstein', 'Einstein family'],
  thephantommenace: ['Star Wars: Episode I – The Phantom Menace', 'The Phantom Menace'],
  phantommenace: ['Star Wars: Episode I – The Phantom Menace', 'The Phantom Menace'],
  masseffect: ['Mass Effect', 'Mass Effect (video game)', 'Mass Effect (franchise)'],
  starwars: ['Star Wars', 'Star Wars (film)', 'Star Wars franchise'],
  indianajones: ['Indiana Jones', 'Indiana Jones (franchise)'],
  cartman: ['Eric Cartman'],
  dexterslab: ["Dexter's Laboratory"],
  cowardthecouragelydog: ['Courage the Cowardly Dog'],
  couragethecouragelydog: ['Courage the Cowardly Dog'],
  barbrastiesand: ['Barbra Streisand'],
  barbrastreisand: ['Barbra Streisand'],
  johndimaggio: ['John DiMaggio'],
  frozone: ['Frozone', 'Lucius Best'],
  ben10: ['Ben Tennyson', 'Ben 10'],
  dash: ['Dash Parr', 'The Incredibles'],
  flash: ['The Flash (Barry Allen)', 'The Flash'],
  mrbeast: ['MrBeast', 'Jimmy Donaldson'],
  bojackson: ['Bo Jackson']
  ,
  dococ: ['Doctor Octopus', 'Doc Ock', 'Doctor Octopus (character)'],
  docock: ['Doctor Octopus', 'Doc Ock', 'Doctor Octopus (character)'],
  jerrysienfield: ['Jerry Seinfeld'],
  jerryseinfeld: ['Jerry Seinfeld'],
  peterparker: ['Peter Parker', 'Spider-Man', 'Spider-Man (character)'],
  stitch: ['Stitch (Disney)', 'Stitch (Lilo & Stitch)', 'Stitch', 'Lilo & Stitch'],
  ronaldmcdonald: ['Ronald McDonald', "McDonald's"],
  dipperpines: ['Dipper Pines', 'Gravity Falls'],
  luffy: ['Monkey D. Luffy', 'Luffy', 'One Piece'],
  toothless: ['Toothless (How to Train Your Dragon)', 'Toothless', 'How to Train Your Dragon']
  ,
  po: ['Po (Kung Fu Panda)', 'Po (Kung Fu Panda character)', 'Kung Fu Panda'],
  michaelangelo: ['Michelangelo (Teenage Mutant Ninja Turtles)', 'Michelangelo', 'Teenage Mutant Ninja Turtles'],
  gojosatoru: ['Satoru Gojo', 'Gojo Satoru', 'Jujutsu Kaisen'],
  naruto: ['Naruto Uzumaki', 'Naruto'],
  narutouzumaki: ['Naruto Uzumaki', 'Naruto'],
  drstrange: ['Doctor Strange', 'Doctor Strange (character)', 'Stephen Strange'],
  doctorstrange: ['Doctor Strange', 'Doctor Strange (character)', 'Stephen Strange'],
  scarletwitch: ['Scarlet Witch', 'Wanda Maximoff', 'Scarlet Witch (Marvel Comics)'],
  raventeentitans: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)'],
  raven: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)'],
  starfire: ['Starfire (Teen Titans)', 'Starfire', 'Koriand\'r'],
  atomeve: ['Atom Eve', 'Samantha Eve Wilkins', 'Invincible (TV series)'],
  frieren: ['Frieren (character)', 'Frieren', "Frieren: Beyond Journey's End"],
  aang: ['Aang', 'Avatar: The Last Airbender'],
  mob: ['Shigeo Kageyama', 'Mob Psycho 100', 'Mob (Mob Psycho 100)'],
  mobpsycho: ['Shigeo Kageyama', 'Mob Psycho 100'],
  mobmobphysco: ['Shigeo Kageyama', 'Mob Psycho 100'],
  mobmobpsycho: ['Shigeo Kageyama', 'Mob Psycho 100'],
  davidblaine: ['David Blaine']
  ,
  elon: ['Elon Musk'],
  magneto: ['Magneto', 'Magneto (Marvel Comics)'],
  slenderman: ['Slender Man', 'Slender Man (mythical creature)'],
  fryfuturama: ['Philip J. Fry', 'Fry (Futurama)'],
  laracroftog: ['Lara Croft', 'Tomb Raider'],
  winnethepooh: ['Winnie-the-Pooh', 'Winnie the Pooh'],
  winniethepooh: ['Winnie-the-Pooh', 'Winnie the Pooh'],
  therock: ['Dwayne Johnson', 'The Rock (professional wrestler)'],
  dwaynejohnson: ['Dwayne Johnson', 'The Rock (professional wrestler)'],
  themyscira: ['Themyscira', 'Wonder Woman'],
  h2o: ['Water', 'H2O'],
  pbj: ['Peanut butter and jelly sandwich', 'Peanut butter and jelly'],
  ufo: ['Unidentified flying object', 'UFO'],
  got: ['Game of Thrones'],
  rdr2: ['Red Dead Redemption 2'],
  tmnt: ['Teenage Mutant Ninja Turtles'],
  thedoctor: ['Doctor Who', 'The Doctor (Doctor Who)'],
  thegoat: ['Goat', 'Greatest of all time'],
  winteriscoming: ['Game of Thrones'],
  iaminevitable: ['Thanos'],
  yabbadabbadoo: ['Fred Flintstone', 'The Flintstones'],
  maytheodds: ['The Hunger Games'],
  hotcheetos: ["Flamin' Hot Cheetos", 'Cheetos'],
  churros: ['Churro', 'Churros'],
  lasagne: ['Lasagna', 'Lasagne'],
  ramentonkotsu: ['Tonkotsu ramen', 'Ramen'],
  shaq: ["Shaquille O'Neal", 'Shaq'],
  biggiesmalls: ['The Notorious B.I.G.', 'Christopher Wallace'],
  rbg: ['Ruth Bader Ginsburg', 'RBG'],
  katara: ['Katara (Avatar: The Last Airbender)', 'Katara'],
  tchalla: ["T'Challa", 'Black Panther (character)'],
  spammusubi: ['Spam musubi', 'Musubi'],
  mclovin: ['McLovin', 'Superbad'],
  caesaraugustus: ['Augustus', 'Caesar Augustus'],
  theundertaker: ['The Undertaker', 'Mark Calaway'],
  bowserjr: ['Bowser Jr.', 'Bowser Jr'],
  crocanimal: ['Crocodile', 'Crocodileidae'],
  mrbean: ['Mr. Bean'],
  rasputin: ['Grigori Rasputin', 'Rasputin'],
  sauruman: ['Saruman'],
  stormtrooper: ['Stormtrooper', 'Star Wars stormtrooper'],
  subzero: ['Sub-Zero', 'Sub-Zero (Mortal Kombat)'],
  subzerro: ['Sub-Zero', 'Sub-Zero (Mortal Kombat)'],
  countdracula: ['Count Dracula', 'Dracula'],
  kfcbucket: ['KFC', 'Kentucky Fried Chicken'],
  bbqribs: ['Barbecue', 'Ribs'],
  neotokyo: ['Neo Tokyo', 'Akira'],
  crttv: ['Cathode-ray tube', 'Television'],
  crtmonitor: ['Cathode-ray tube', 'Computer monitor'],
  crt: ['Cathode-ray tube'],
  lcdscreen: ['Liquid-crystal display', 'Display device'],
  lcd: ['Liquid-crystal display'],
  bmo: ['BMO (Adventure Time)', 'BMO'],
  chucky: ['Chucky (character)', "Child's Play (franchise)"],
  batarang: ['Batarang'],
  kfcbucket: ['KFC', 'Kentucky Fried Chicken'],
  mrworldwide: ['Pitbull (rapper)', 'Pitbull'],
  ashitaka: ['Ashitaka', 'Princess Mononoke'],
  alucard: ['Alucard (Hellsing)', 'Alucard', 'Hellsing'],
  bugsbunnyjr: ['Bugs Bunny', 'Looney Tunes'],
  saitma: ['Saitama', 'One-Punch Man'],
  aquafina: ['Aquafina', 'Aquafina (brand)'],
  aquaoshinoko: ['Aquamarine Hoshino', 'Aqua Hoshino', 'Oshi no Ko'],
  caesar: ['Julius Caesar', 'Caesar (title)'],
  colsanders: ['Colonel Sanders', 'KFC'],
  cpu: ['Central processing unit', 'CPU'],
  croissantwich: ['Croissant sandwich', 'Croissant'],
  doomslayer: ['Doom Slayer', 'Doomguy', 'Doom (franchise)'],
  katniss: ['Katniss Everdeen', 'Katniss'],
  ladygaga: ['Lady Gaga'],
  medivaltimes: ['Medieval Times'],
  mochaccino: ['Mocha cappuccino', 'Cappuccino'],
  mountrainier: ['Mount Rainier'],
  poseidon: ['Poseidon', 'Poseidon (mythology)', 'Poseidon (god)'],
  posedion: ['Poseidon', 'Poseidon (mythology)', 'Poseidon (god)'],
  megantrainor: ['Meghan Trainor'],
  megantrainer: ['Meghan Trainor'],
  bobripley: ['Robert Ripley', "Ripley's Believe It or Not!"],
  n64: ['Nintendo 64'],
  poseidonstrident: ["Poseidon's trident", 'Poseidon'],
  quinoa: ['Quinoa'],
  r2: ['R2-D2'],
  hakunamatata: ['Hakuna Matata', 'The Lion King'],
  baymax: ['Baymax', 'Big Hero 6'],
  jeangrey: ['Jean Grey', 'Phoenix (Marvel Comics)'],
  johnwick: ['John Wick'],
  muhammadali: ['Muhammad Ali'],
  muhhamadali: ['Muhammad Ali'],
  rocky: ['Rocky Balboa', 'Rocky'],
  rockybalboa: ['Rocky Balboa', 'Rocky'],
  sukuna: ['Ryomen Sukuna', 'Sukuna'],
  jakethedog: ['Jake the Dog', 'Adventure Time'],
  jakedog: ['Jake the Dog', 'Adventure Time'],
  danawhite: ['Dana White', 'Ultimate Fighting Championship'],
  joerogan: ['Joe Rogan'],
  lebronjames: ['LeBron James'],
  lebron: ['LeBron James'],
  finnthehuman: ['Finn the Human', 'Adventure Time'],
  brucelee: ['Bruce Lee'],
  teddyroosevelt: ['Theodore Roosevelt'],
  theodoreroosevelt: ['Theodore Roosevelt'],
  jfk: ['John F. Kennedy'],
  johnfkennedy: ['John F. Kennedy'],
  donaldtrump: ['Donald Trump'],
  lordfarquad: ['Lord Farquaad'],
  lordfarquaad: ['Lord Farquaad'],
  ishigamisenky: ['Senku Ishigami', 'Dr. Stone'],
  krakenmyth: ['Kraken'],
  sherlockh: ['Sherlock Holmes'],
  simbajr: ['Simba'],
  skyrim: ['The Elder Scrolls V: Skyrim', 'Skyrim'],
  spam: ['Spam (food)', 'Spam'],
  storm: ['Storm (Marvel Comics)', 'Storm'],
  thechosenone: ['Chosen one', 'Neo (The Matrix)', 'Anakin Skywalker'],
  reddead: ['Red Dead Redemption', 'Red Dead Redemption 2']
  ,
  lokivariant: ['Loki', 'Loki (Marvel Cinematic Universe)', 'Loki (TV series)'],
  magnetohelmet: ['Magneto', "Magneto's helmet"],
  tpain: ['T-Pain'],
  billiee: ['Billie Eilish'],
  bluey: ['Bluey (2018 TV series)', 'Bluey'],
  macbook: ['MacBook'],
  thethinker: ['The Thinker', 'Auguste Rodin'],
  capncrunch: ["Cap'n Crunch", 'Captain Crunch'],
  dobby: ['Dobby (Harry Potter)', 'Dobby'],
  drax: ['Drax (character)', 'Drax the Destroyer'],
  pewdiepie: ['PewDiePie', 'Felix Kjellberg'],
  erenyeager: ['Eren Yeager', 'Eren Jaeger', 'Attack on Titan'],
  grootjr: ['Groot', 'Baby Groot'],
  hotfudge: ['Hot fudge', 'Chocolate syrup'],
  ichigo: ['Ichigo Kurosaki', 'Ichigo'],
  ladyliberty: ['Statue of Liberty', 'Lady Liberty'],
  mountfujisan: ['Mount Fuji'],
  pepsimax: ['Pepsi Max', 'Pepsi Zero Sugar'],
  zeldabotw: ['The Legend of Zelda: Breath of the Wild', 'Zelda'],
  yennefer: ['Yennefer of Vengerberg', 'Yennefer'],
  thorinoakenshield: ['Thorin Oakenshield', 'Thorin'],
  lightningmcqueen: ['Lightning McQueen', 'Cars (film)'],
  dochudson: ['Doc Hudson', 'Hudson Hornet', 'Cars (film)'],
  theking: ['Strip Weathers', 'The King (Cars)', 'Cars (film)'],
  racerx: ['Racer X', 'Speed Racer'],
  mac5: ['Mach Five', 'Speed Racer'],
  shawnwhite: ['Shaun White'],
  babydriver: ['Baby (Baby Driver)', 'Baby Driver'],
  turbo: ['Turbo (film)', 'Turbo (character)']
  ,
  hadesunderworld: ['Hades', 'Greek underworld', 'Underworld'],
  cybertron: ['Cybertron', 'Transformers'],
  wakandan: ['Wakanda', 'Wakandan'],
  detectiveconan: ['Detective Conan', 'Case Closed', 'Conan Edogawa'],
  detectivepikachu: ['Detective Pikachu (video game)', 'Detective Pikachu', 'Pikachu'],
  perrytheplatypus: ['Perry the Platypus', 'Agent P', 'Phineas and Ferb'],
  monkeyddragon: ['Monkey D. Dragon', 'Monkey D Dragon', 'One Piece'],
  drwatson: ['Dr. Watson', 'John Watson', 'Doctor Watson'],
  aceventura: ['Ace Ventura', 'Ace Ventura: Pet Detective'],
  loidforger: ['Loid Forger', 'Twilight (Spy x Family)', 'Spy x Family'],
  senate: ['Senate', 'Galactic Senate'],
  margotrobbie: ['Margot Robbie', 'Margot Elise Robbie'],
  natskisubaru: ['Natsuki Subaru', 'Subaru Natsuki', 'Re:Zero'],
  natsukisubaru: ['Natsuki Subaru', 'Subaru Natsuki', 'Re:Zero'],
  emiyashirou: ['Shirou Emiya', 'Fate/stay night', 'Fate series'],
  kiritsugushirou: ['Kiritsugu Emiya', 'Fate/Zero', 'Fate series'],
  charilechaplin: ['Charlie Chaplin'],
  charliechaplin: ['Charlie Chaplin']
};
const RESOLUTION_ALIAS_OVERRIDES = {
  ironman: {
    queries: ['Iron Man (character)', 'Iron Man', 'Tony Stark'],
    rejectTitles: ['Iron Man (disambiguation)'],
    allowTitles: ['Iron Man', 'Iron Man (character)', 'Tony Stark']
  },
  gandalf: {
    queries: ['Gandalf', 'Gandalf (Middle-earth)'],
    rejectTitles: ['Gandalf (disambiguation)'],
    allowTitles: ['Gandalf', 'Gandalf (Middle-earth)']
  },
  beethoven: {
    queries: ['Ludwig van Beethoven', 'Beethoven'],
    rejectTitles: ["Beethoven's 5th (film)", 'Beethoven (disambiguation)'],
    allowTitles: ['Ludwig van Beethoven', 'Beethoven']
  },
  mozart: {
    queries: ['Wolfgang Amadeus Mozart', 'Mozart'],
    rejectTitles: ['Mozart (disambiguation)'],
    allowTitles: ['Wolfgang Amadeus Mozart', 'Mozart']
  },
  hellokitty: {
    queries: ['Hello Kitty'],
    rejectTitles: ['Hello Kitty (disambiguation)'],
    allowTitles: ['Hello Kitty']
  },
  masterchief: {
    queries: ['Master Chief (Halo)', 'Master Chief', 'Halo (franchise)'],
    rejectTitles: ['Master Chief (disambiguation)'],
    allowTitles: ['Master Chief (Halo)', 'Master Chief']
  },
  pinkpanther: {
    queries: ['Pink Panther (character)', 'The Pink Panther', 'Pink Panther'],
    rejectTitles: ['Pink Panther (disambiguation)'],
    allowTitles: ['Pink Panther (character)', 'The Pink Panther', 'Pink Panther']
  },
  scooby: {
    queries: ['Scooby-Doo', 'Scooby-Doo (character)', 'Scooby'],
    rejectTitles: ['Scooby-Doo (franchise)', 'Scooby-Doo (disambiguation)'],
    allowTitles: ['Scooby-Doo', 'Scooby-Doo (character)']
  },
  ben10: {
    queries: ['Ben 10', 'Ben Tennyson'],
    rejectTitles: ['Ben (disambiguation)'],
    allowTitles: ['Ben 10', 'Ben Tennyson']
  },
  masseffect: {
    queries: ['Mass Effect', 'Mass Effect (video game)', 'Mass Effect (franchise)'],
    rejectTitles: ['Mass effect (disambiguation)'],
    allowTitles: ['Mass Effect', 'Mass Effect (video game)', 'Mass Effect (franchise)']
  },
  starwars: {
    queries: ['Star Wars', 'Star Wars (film)', 'Star Wars franchise'],
    rejectTitles: ['Star Wars (disambiguation)'],
    allowTitles: ['Star Wars', 'Star Wars (film)', 'Star Wars franchise']
  },
  indianajones: {
    queries: ['Indiana Jones', 'Indiana Jones (franchise)'],
    rejectTitles: ['Indiana Jones (disambiguation)'],
    allowTitles: ['Indiana Jones', 'Indiana Jones (franchise)']
  },
  poseidon: {
    queries: ['Poseidon', 'Poseidon (mythology)'],
    rejectTitles: ['The Poseidon Adventure', 'Poseidon (disambiguation)', 'Poseidon (film)'],
    allowTitles: ['Poseidon']
  },
  posedion: {
    queries: ['Poseidon', 'Poseidon (mythology)'],
    rejectTitles: ['The Poseidon Adventure', 'Poseidon (disambiguation)', 'Poseidon (film)'],
    allowTitles: ['Poseidon']
  },
  megantrainor: {
    queries: ['Meghan Trainor'],
    rejectTitles: ['Megan', 'Megan (disambiguation)'],
    allowTitles: ['Meghan Trainor']
  },
  megantrainer: {
    queries: ['Meghan Trainor'],
    rejectTitles: ['Megan', 'Megan (disambiguation)'],
    allowTitles: ['Meghan Trainor']
  },
  bobripley: {
    queries: ['Robert Ripley', "Ripley's Believe It or Not!"],
    rejectTitles: ['Pink Panther (character)', 'Pink Panther'],
    allowTitles: ['Robert Ripley', "Ripley's Believe It or Not!"]
  },
  pewdiepie: {
    queries: ['PewDiePie', 'Felix Kjellberg'],
    rejectTitles: ['PewDiePie (disambiguation)'],
    allowTitles: ['PewDiePie', 'Felix Kjellberg']
  },
  ishigamisenky: {
    queries: ['Senku Ishigami', 'Dr. Stone'],
    rejectTitles: ['Senku', 'Ishigami'],
    allowTitles: ['Senku Ishigami', 'Dr. Stone']
  },
  shangchi: {
    queries: ['Shang-Chi', 'Shang-Chi (Marvel Cinematic Universe)'],
    rejectTitles: ['Shang-Chi and the Legend of the Ten Rings'],
    allowTitles: ['Shang-Chi', 'Shang-Chi (Marvel Cinematic Universe)']
  },
  cristianoronaldo: {
    queries: ['Cristiano Ronaldo'],
    allowTitles: ['Cristiano Ronaldo']
  },
  elvispresley: {
    queries: ['Elvis Presley'],
    allowTitles: ['Elvis Presley']
  },
  kimpossible: {
    queries: ['Kim Possible (character)', 'Kim Possible'],
    rejectTitles: ['Kim Possible (TV series)', 'Kim Possible (disambiguation)'],
    allowTitles: ['Kim Possible (character)', 'Kim Possible']
  },
  sungjinwoo: {
    queries: ['Solo Leveling'],
    rejectTitles: ['Jung Woo-sung', 'Aleks Le'],
    allowTitles: ['Solo Leveling']
  },
  swiper: {
    queries: ['Swiper (Dora the Explorer)', 'Dora the Explorer'],
    rejectTitles: []
  },
  guyfiery: {
    queries: ['Guy Fieri'],
    rejectTitles: ['Family Guy', 'Super Mario'],
    allowTitles: ['Guy Fieri']
  },
  piesymbol: {
    queries: ['Pi'],
    rejectTitles: ['Symbol', 'Bride of Frankenstein (character)'],
    allowTitles: ['Pi']
  },
  swampert: {
    queries: ['List of generation III Pokémon'],
    rejectTitles: ['Swamp Thing (1982 film)'],
    allowTitles: ['List of generation III Pokémon']
  },
  blackwidow: {
    queries: ['Black Widow (Natasha Romanova)', 'Black Widow (Marvel Comics)', 'Black Widow (2021 film)'],
    rejectTitles: ['black widow']
  },
  drstrange: {
    queries: ['Doctor Strange (character)', 'Doctor Strange', 'Stephen Strange'],
    rejectTitles: ['Doctor Strange in the Multiverse of Madness', 'Doctor Strange (disambiguation)'],
    allowTitles: ['Doctor Strange (character)', 'Doctor Strange', 'Stephen Strange']
  },
  doctorstrange: {
    queries: ['Doctor Strange (character)', 'Doctor Strange', 'Stephen Strange'],
    rejectTitles: ['Doctor Strange in the Multiverse of Madness', 'Doctor Strange (disambiguation)'],
    allowTitles: ['Doctor Strange (character)', 'Doctor Strange', 'Stephen Strange']
  },
  scarletwitch: {
    queries: ['Scarlet Witch', 'Wanda Maximoff', 'Scarlet Witch (Marvel Comics)'],
    rejectTitles: ['WandaVision', 'Scarlet Witch (disambiguation)'],
    allowTitles: ['Scarlet Witch', 'Wanda Maximoff', 'Scarlet Witch (Marvel Comics)']
  },
  raven: {
    queries: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)'],
    rejectTitles: ['Raven (bird)', 'Common raven', 'Raven (disambiguation)'],
    allowTitles: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)']
  },
  raventeentitans: {
    queries: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)'],
    rejectTitles: ['Raven (bird)', 'Common raven', 'Raven (disambiguation)'],
    allowTitles: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)']
  },
  starfire: {
    queries: ['Starfire (Teen Titans)', 'Starfire', "Koriand'r"],
    rejectTitles: ['Starfire (disambiguation)', 'Starfire (band)'],
    allowTitles: ['Starfire (Teen Titans)', 'Starfire', "Koriand'r"]
  },
  atomeve: {
    queries: ['Atom Eve', 'Samantha Eve Wilkins', 'Invincible (TV series)'],
    rejectTitles: ['Eve (disambiguation)', 'Atom Eve (disambiguation)'],
    allowTitles: ['Atom Eve', 'Samantha Eve Wilkins']
  },
  frieren: {
    queries: ['Frieren (character)', 'Frieren', "Frieren: Beyond Journey's End"],
    rejectTitles: ['Frieren: Beyond Journey\'s End', 'Frieren (disambiguation)'],
    allowTitles: ['Frieren (character)', 'Frieren']
  },
  aang: {
    queries: ['Aang', 'Avatar: The Last Airbender'],
    rejectTitles: ['Aang (disambiguation)'],
    allowTitles: ['Aang']
  },
  mob: {
    queries: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)', 'Mob Psycho 100'],
    rejectTitles: ['Mob (disambiguation)', 'Mob rule'],
    allowTitles: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)']
  },
  mobmobphysco: {
    queries: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)', 'Mob Psycho 100'],
    rejectTitles: ['Mob (disambiguation)', 'Mob rule'],
    allowTitles: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)']
  },
  mobmobpsycho: {
    queries: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)', 'Mob Psycho 100'],
    rejectTitles: ['Mob (disambiguation)', 'Mob rule'],
    allowTitles: ['Shigeo Kageyama', 'Mob (Mob Psycho 100)']
  },
  narutouzumaki: {
    queries: ['Naruto Uzumaki', 'Naruto'],
    rejectTitles: ['Naruto (manga)', 'Naruto (franchise)', 'Naruto (disambiguation)'],
    allowTitles: ['Naruto Uzumaki']
  },
  davidblaine: {
    queries: ['David Blaine'],
    rejectTitles: ['Blaine (disambiguation)'],
    allowTitles: ['David Blaine']
  },
  peach: {
    queries: ['Princess Peach', 'Peach'],
    rejectTitles: ['Peach (disambiguation)'],
    allowTitles: ['Princess Peach', 'Peach']
  },
  robin: {
    queries: ['Nico Robin (One Piece)', 'Nico Robin', 'Robin (DC Comics)', 'Robin'],
    rejectTitles: ['Robin (disambiguation)'],
    allowTitles: ['Nico Robin (One Piece)', 'Nico Robin', 'Robin (DC Comics)', 'Robin']
  },
  lightningmcqueen: {
    queries: ['Lightning McQueen', 'Lightning McQueen (Cars)'],
    rejectTitles: ['Lightning McQueen (disambiguation)'],
    allowTitles: ['Lightning McQueen', 'Lightning McQueen (Cars)']
  },
  dochudson: {
    queries: ['Doc Hudson', 'Hudson Hornet', 'Cars (film)'],
    rejectTitles: ['Doc Hudson (disambiguation)'],
    allowTitles: ['Doc Hudson', 'Hudson Hornet']
  },
  theking: {
    queries: ['Strip Weathers (Cars)', 'Strip Weathers', 'The King (Cars)', 'Cars (film)'],
    rejectTitles: ['The King (disambiguation)'],
    allowTitles: ['Strip Weathers (Cars)', 'Strip Weathers', 'The King (Cars)']
  },
  racerx: {
    queries: ['Racer X', 'Speed Racer'],
    rejectTitles: ['Racer X (disambiguation)'],
    allowTitles: ['Racer X']
  },
  mac5: {
    queries: ['Mach Five (Speed Racer)', 'Mach Five', 'Speed Racer'],
    rejectTitles: ['Mac 5 (disambiguation)'],
    allowTitles: ['Mach Five (Speed Racer)', 'Mach Five']
  },
  shawnwhite: {
    queries: ['Shaun White'],
    rejectTitles: ['Shawn White'],
    allowTitles: ['Shaun White']
  },
  babydriver: {
    queries: ['Baby (Baby Driver)', 'Baby Driver'],
    rejectTitles: ['Baby (disambiguation)'],
    allowTitles: ['Baby (Baby Driver)', 'Baby Driver']
  },
  turbo: {
    queries: ['Turbo (film)', 'Turbo (character)'],
    rejectTitles: ['Turbo (disambiguation)'],
    allowTitles: ['Turbo (film)', 'Turbo (character)']
  },
  hulk: {
    queries: ['Hulk (Marvel Comics)', 'Hulk'],
    rejectTitles: ['Hulk (disambiguation)', 'Hulk (film)', 'The Incredible Hulk (film)'],
    allowTitles: ['Hulk (Marvel Comics)', 'Hulk']
  },
  elon: {
    queries: ['Elon Musk'],
    rejectTitles: ['Elon (disambiguation)'],
    allowTitles: ['Elon Musk']
  },
  magneto: {
    queries: ['Magneto (Marvel Comics)', 'Magneto'],
    rejectTitles: ['Magneto (disambiguation)'],
    allowTitles: ['Magneto (Marvel Comics)', 'Magneto']
  },
  slenderman: {
    queries: ['Slender Man', 'Slender Man (mythical creature)'],
    rejectTitles: ['Slender Man (disambiguation)'],
    allowTitles: ['Slender Man', 'Slender Man (mythical creature)']
  },
  fryfuturama: {
    queries: ['Philip J. Fry', 'Fry (Futurama)', 'Futurama'],
    rejectTitles: ['McDonaldland'],
    allowTitles: ['Philip J. Fry', 'Fry (Futurama)', 'Futurama']
  },
  laracroftog: {
    queries: ['Lara Croft', 'Tomb Raider'],
    rejectTitles: ['Lara (name)'],
    allowTitles: ['Lara Croft', 'Tomb Raider']
  },
  winnethepooh: {
    queries: ['Winnie-the-Pooh', 'Winnie the Pooh'],
    rejectTitles: ['My Friends Tigger & Pooh'],
    allowTitles: ['Winnie-the-Pooh', 'Winnie the Pooh']
  },
  winniethepooh: {
    queries: ['Winnie-the-Pooh', 'Winnie the Pooh'],
    rejectTitles: ['My Friends Tigger & Pooh'],
    allowTitles: ['Winnie-the-Pooh', 'Winnie the Pooh']
  },
  thehulk: {
    queries: ['Hulk (Marvel Comics)', 'Hulk', 'The Hulk'],
    rejectTitles: ['Hulk (disambiguation)', 'Hulk (film)', 'The Incredible Hulk (film)'],
    allowTitles: ['Hulk (Marvel Comics)', 'Hulk', 'The Hulk']
  },
  brucebanner: {
    queries: ['Bruce Banner', 'Bruce Banner (Marvel Cinematic Universe)', 'Hulk (Marvel Comics)'],
    rejectTitles: ['Bruce Banner (disambiguation)', 'Hulk (film)', 'The Incredible Hulk (film)'],
    allowTitles: ['Bruce Banner', 'Bruce Banner (Marvel Cinematic Universe)', 'Hulk (Marvel Comics)']
  },
  h2o: {
    queries: ['Water', 'H2O'],
    rejectTitles: ['H2O (disambiguation)'],
    allowTitles: ['Water', 'H2O']
  },
  pbj: {
    queries: ['Peanut butter and jelly sandwich', 'Peanut butter and jelly'],
    rejectTitles: [],
    allowTitles: ['Peanut butter and jelly sandwich', 'Peanut butter and jelly']
  },
  spammusubi: {
    queries: ['Spam musubi', 'Musubi'],
    rejectTitles: ['Kagu-tsuchi'],
    allowTitles: ['Spam musubi']
  },
  shaq: {
    queries: ["Shaquille O'Neal", 'Shaq'],
    rejectTitles: ['Shaquill Griffin'],
    allowTitles: ["Shaquille O'Neal", 'Shaq']
  },
  biggiesmalls: {
    queries: ['The Notorious B.I.G.', 'Biggie Smalls'],
    rejectTitles: [],
    allowTitles: ['The Notorious B.I.G.', 'Biggie Smalls']
  },
  rbg: {
    queries: ['Ruth Bader Ginsburg', 'RBG'],
    rejectTitles: ['Plumeria'],
    allowTitles: ['Ruth Bader Ginsburg', 'RBG']
  },
  katara: {
    queries: ['Katara (Avatar: The Last Airbender)', 'Katara', 'Avatar: The Last Airbender'],
    rejectTitles: ['Katarina Wolfkostin'],
    allowTitles: ['Katara (Avatar: The Last Airbender)', 'Katara']
  },
  tchalla: {
    queries: ["T'Challa", 'Black Panther (character)', "T'Challa (Marvel Cinematic Universe)"],
    rejectTitles: ['Black Panther (film)', 'TChalla'],
    allowTitles: ["T'Challa", 'Black Panther (character)', "T'Challa (Marvel Cinematic Universe)"]
  },
  mclovin: {
    queries: ['McLovin', 'Superbad'],
    rejectTitles: ['Moulin Rouge!'],
    allowTitles: ['McLovin', 'Superbad']
  },
  churros: {
    queries: ['Churro', 'Churros'],
    rejectTitles: [],
    allowTitles: ['Churro', 'Churros']
  },
  lasagne: {
    queries: ['Lasagna', 'Lasagne'],
    rejectTitles: [],
    allowTitles: ['Lasagna', 'Lasagne']
  },
  ramentonkotsu: {
    queries: ['Tonkotsu ramen', 'Ramen'],
    rejectTitles: ['Genshiken'],
    allowTitles: ['Tonkotsu ramen']
  },
  caesaraugustus: {
    queries: ['Augustus', 'Caesar Augustus', 'Augustus (title)'],
    rejectTitles: ['Philip II of France'],
    allowTitles: ['Augustus', 'Caesar Augustus', 'Augustus (title)']
  },
  theundertaker: {
    queries: ['The Undertaker', 'Undertaker (wrestler)', 'Mark Calaway'],
    rejectTitles: ['Character.ai'],
    allowTitles: ['The Undertaker', 'Undertaker (wrestler)', 'Mark Calaway']
  },
  bowserjr: {
    queries: ['Bowser Jr.', 'Bowser Jr'],
    rejectTitles: ['Muriel Bowser'],
    allowTitles: ['Bowser Jr.', 'Bowser Jr', 'Bowser Jr. (character)']
  },
  crocanimal: {
    queries: ['Crocodile', 'Crocodileidae'],
    rejectTitles: ['Killer Croc', 'Batman Unlimited: Animal Instincts'],
    allowTitles: ['Crocodile', 'Crocodileidae']
  },
  mrbean: {
    queries: ['Mr. Bean'],
    rejectTitles: ['Sawney Bean'],
    allowTitles: ['Mr. Bean']
  },
  rasputin: {
    queries: ['Grigori Rasputin', 'Rasputin'],
    rejectTitles: ['Maria Rasputin'],
    allowTitles: ['Grigori Rasputin', 'Rasputin']
  },
  sauruman: {
    queries: ['Saruman'],
    rejectTitles: ['Sauron'],
    allowTitles: ['Saruman']
  },
  stormtrooper: {
    queries: ['Stormtrooper', 'Stormtrooper (Star Wars)'],
    rejectTitles: ['Stormtrooper in Drag'],
    allowTitles: ['Stormtrooper', 'Stormtrooper (Star Wars)']
  },
  subzerro: {
    queries: ['Sub-Zero', 'Sub-Zero (Mortal Kombat)'],
    rejectTitles: ['Sub Zero Project'],
    allowTitles: ['Sub-Zero', 'Sub-Zero (Mortal Kombat)']
  },
  countdracula: {
    queries: ['Count Dracula', 'Dracula'],
    rejectTitles: ['Mina Harker'],
    allowTitles: ['Count Dracula', 'Dracula']
  },
  kratos: {
    queries: ['Kratos (God of War)', 'Kratos'],
    rejectTitles: ['Kratos (disambiguation)', 'Kratos (mythology)'],
    allowTitles: ['Kratos (God of War)', 'Kratos']
  },
  baki: {
    queries: ['Baki Hanma', 'Baki the Grappler', 'Baki'],
    rejectTitles: ['Baki (disambiguation)'],
    allowTitles: ['Baki Hanma', 'Baki the Grappler', 'Baki']
  },
  itadoriyuji: {
    queries: ['Yuji Itadori', 'Jujutsu Kaisen'],
    rejectTitles: ['Itadori'],
    allowTitles: ['Yuji Itadori', 'Jujutsu Kaisen']
  },
  yujiitadori: {
    queries: ['Yuji Itadori', 'Jujutsu Kaisen'],
    rejectTitles: ['Itadori'],
    allowTitles: ['Yuji Itadori', 'Jujutsu Kaisen']
  },
  jesuschrist: {
    queries: ['Jesus'],
    rejectTitles: ['Christ figure'],
    allowTitles: ['Jesus']
  },
  shaggy: {
    queries: ['Shaggy Rogers', 'Scooby-Doo'],
    rejectTitles: ['Shaggy (musician)'],
    allowTitles: ['Shaggy Rogers', 'Scooby-Doo']
  },
  sanji: {
    queries: ['Sanji (One Piece)', 'Vinsmoke Sanji'],
    rejectTitles: ['Sanji'],
    allowTitles: ['Sanji (One Piece)']
  },
  daffyduck: {
    queries: ['Daffy Duck', 'Looney Tunes'],
    rejectTitles: ['Daffy Duck (disambiguation)'],
    allowTitles: ['Daffy Duck']
  },
  deadspoetssociety: {
    queries: ['Dead Poets Society'],
    rejectTitles: ['Poet Society'],
    allowTitles: ['Dead Poets Society']
  },
  deadpoetssociety: {
    queries: ['Dead Poets Society'],
    rejectTitles: ['Poet Society'],
    allowTitles: ['Dead Poets Society']
  },
  deadspoetsociety: {
    queries: ['Dead Poets Society'],
    rejectTitles: ['Poet Society'],
    allowTitles: ['Dead Poets Society']
  },
  charlote: {
    queries: ['Charlotte, North Carolina', 'Charlotte (given name)', 'Charlotte'],
    rejectTitles: ['Charlotte (disambiguation)', 'Émmanuel Charlot'],
    allowTitles: ['Charlotte, North Carolina', 'Charlotte (given name)', 'Charlotte']
  },
  drsuess: {
    queries: ['Dr. Seuss'],
    rejectTitles: ['Seussical'],
    allowTitles: ['Dr. Seuss']
  },
  edgarallenpoe: {
    queries: ['Edgar Allan Poe'],
    rejectTitles: ['Edgar Allen'],
    allowTitles: ['Edgar Allan Poe']
  },
  galielo: {
    queries: ['Galileo Galilei'],
    rejectTitles: ['Galileo (disambiguation)'],
    allowTitles: ['Galileo Galilei']
  },
  bugsbunny: {
    queries: ['Bugs Bunny'],
    rejectTitles: ['Bugs Bunny (disambiguation)'],
    allowTitles: ['Bugs Bunny']
  },
  sherlokholmes: {
    queries: ['Sherlock Holmes'],
    rejectTitles: ['John Holmes (actor)', 'Holmes (disambiguation)'],
    allowTitles: ['Sherlock Holmes']
  },
  goku: {
    queries: ['Goku', 'Son Goku', 'Dragon Ball'],
    rejectTitles: ['Gokurakugai', 'Goku (disambiguation)'],
    allowTitles: ['Goku', 'Son Goku']
  },
  steve: {
    queries: ['Steve Jobs', 'Steve (Minecraft)', 'Steve'],
    rejectTitles: ['Steve (disambiguation)'],
    allowTitles: ['Steve Jobs', 'Steve (Minecraft)', 'Steve']
  },
  tonystark: {
    queries: ['Tony Stark', 'Iron Man'],
    rejectTitles: ['Tony Stark (disambiguation)'],
    allowTitles: ['Tony Stark', 'Iron Man']
  },
  reedrichards: {
    queries: ['Reed Richards', 'Mister Fantastic'],
    rejectTitles: ['Richards'],
    allowTitles: ['Reed Richards', 'Mister Fantastic']
  },
  reedrichard: {
    queries: ['Reed Richards', 'Mister Fantastic'],
    rejectTitles: ['Richards'],
    allowTitles: ['Reed Richards', 'Mister Fantastic']
  },
  spiderman: {
    queries: ['Spider-Man', 'Spider-Man (character)'],
    rejectTitles: ['Spiderman', 'Spider-Man (disambiguation)'],
    allowTitles: ['Spider-Man', 'Spider-Man (character)']
  },
  captainamerica: {
    queries: ['Captain America (Marvel Comics character)', 'Steve Rogers (Marvel Cinematic Universe)', 'Captain America'],
    rejectTitles: ['Captain America (disambiguation)'],
    allowTitles: ['Captain America (Marvel Comics character)', 'Steve Rogers (Marvel Cinematic Universe)', 'Captain America']
  },
  thanos: {
    queries: ['Thanos'],
    rejectTitles: ['Thanos (disambiguation)'],
    allowTitles: ['Thanos']
  },
  tombraider: {
    queries: ['Tomb Raider', 'Lara Croft'],
    rejectTitles: ['Tomb Raider (disambiguation)'],
    allowTitles: ['Tomb Raider', 'Lara Croft']
  },
  tuffpuppy: {
    queries: ['Dudley Puppy', 'T.U.F.F. Puppy', 'Tuff Puppy'],
    rejectTitles: ['Tuff'],
    allowTitles: ['Dudley Puppy', 'T.U.F.F. Puppy', 'Tuff Puppy']
  },
  joe: {
    queries: ['Joe (singer)', 'Joe Biden'],
    rejectTitles: ['Joe (disambiguation)'],
    allowTitles: ['Joe (singer)', 'Joe Biden']
  },
  sam: {
    queries: ['Samwise Gamgee', 'Sam (singer)'],
    rejectTitles: ['Sam (disambiguation)'],
    allowTitles: ['Samwise Gamgee', 'Sam (singer)']
  },
  fred: {
    queries: ['Fred Flintstone', 'Fred'],
    rejectTitles: ['Fred (disambiguation)'],
    allowTitles: ['Fred Flintstone', 'Fred']
  },
  jimmy: {
    queries: ['Jimmy Neutron', 'Jimmy'],
    rejectTitles: ['Jimmy (disambiguation)'],
    allowTitles: ['Jimmy Neutron', 'Jimmy']
  },
  saber: {
    queries: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
    rejectTitles: ['Saber (disambiguation)'],
    allowTitles: ['Saber (Fate/stay night)', 'Artoria Pendragon']
  },
  saberfatestay: {
    queries: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
    rejectTitles: ['Saber (disambiguation)'],
    allowTitles: ['Saber (Fate/stay night)', 'Artoria Pendragon']
  },
  saberfatestaynight: {
    queries: ['Saber (Fate/stay night)', 'Artoria Pendragon'],
    rejectTitles: ['Saber (disambiguation)'],
    allowTitles: ['Saber (Fate/stay night)', 'Artoria Pendragon']
  },
  joanofarc: {
    queries: ['Joan of Arc'],
    rejectTitles: ['Joan of Arc (disambiguation)'],
    allowTitles: ['Joan of Arc']
  },
  kinghenry: {
    queries: ['Henry VIII of England', 'Henry V of England'],
    rejectTitles: ['Henry (disambiguation)'],
    allowTitles: ['Henry VIII of England', 'Henry V of England']
  },
  teddyroosevelt: {
    queries: ['Theodore Roosevelt', 'Teddy Roosevelt'],
    rejectTitles: ['Roosevelt (disambiguation)'],
    allowTitles: ['Theodore Roosevelt', 'Teddy Roosevelt']
  },
  theodoreroosevelt: {
    queries: ['Theodore Roosevelt', 'Teddy Roosevelt'],
    rejectTitles: ['Roosevelt (disambiguation)'],
    allowTitles: ['Theodore Roosevelt', 'Teddy Roosevelt']
  },
  jfk: {
    queries: ['John F. Kennedy', 'John Fitzgerald Kennedy'],
    rejectTitles: ['JFK (film)', 'JFK (disambiguation)'],
    allowTitles: ['John F. Kennedy', 'John Fitzgerald Kennedy']
  },
  johnfkennedy: {
    queries: ['John F. Kennedy', 'John Fitzgerald Kennedy'],
    rejectTitles: ['JFK (film)', 'JFK (disambiguation)'],
    allowTitles: ['John F. Kennedy', 'John Fitzgerald Kennedy']
  },
  donaldtrump: {
    queries: ['Donald Trump'],
    rejectTitles: ['Donald Trump (disambiguation)'],
    allowTitles: ['Donald Trump']
  },
  brucelee: {
    queries: ['Bruce Lee'],
    rejectTitles: ['Bruce Lee (disambiguation)'],
    allowTitles: ['Bruce Lee']
  },
  guts: {
    queries: ['Guts (Berserk)', 'Berserk (manga)'],
    rejectTitles: ['Blood & Guts'],
    allowTitles: ['Guts (Berserk)', 'Berserk (manga)']
  },
  theflash: {
    queries: ['The Flash (Barry Allen)', 'The Flash'],
    rejectTitles: ['The Flash (disambiguation)'],
    allowTitles: ['The Flash (Barry Allen)', 'The Flash']
  },
  reinhart: {
    queries: ['Reinhardt (Overwatch)', 'Reinhard von Lohengramm'],
    rejectTitles: ['Ramjet (Image Comics)'],
    allowTitles: ['Reinhardt (Overwatch)', 'Reinhard von Lohengramm', 'Reinhardt']
  },
  dannyphantom: {
    queries: ['Danny Phantom'],
    rejectTitles: ["Danny Phantom (TV series)"],
    allowTitles: ['Danny Phantom']
  },
  ishigamisenku: {
    queries: ['Senku Ishigami', 'Dr. Stone'],
    rejectTitles: ['Senku', 'Ishigami'],
    allowTitles: ['Senku Ishigami', 'Dr. Stone']
  },
  drstone: {
    queries: ['Senku Ishigami', 'Dr. Stone'],
    rejectTitles: ['Dr. Stone (disambiguation)'],
    allowTitles: ['Senku Ishigami', 'Dr. Stone']
  },
  batman: {
    queries: ['Batman', 'Batman (Bruce Wayne)'],
    rejectTitles: ['Batman (disambiguation)'],
    allowTitles: ['Batman', 'Batman (Bruce Wayne)']
  },
  truedetective: {
    queries: ['True Detective'],
    rejectTitles: ['True Detective (franchise)'],
    allowTitles: ['True Detective']
  },
  joedimiggio: {
    queries: ['Joe DiMaggio'],
    rejectTitles: ['Joe Dimiggio'],
    allowTitles: ['Joe DiMaggio']
  },
  einstein: {
    queries: ['Albert Einstein'],
    rejectTitles: ['Einstein (disambiguation)'],
    allowTitles: ['Albert Einstein']
  },
  thephantommenace: {
    queries: ['Star Wars: Episode I – The Phantom Menace'],
    rejectTitles: ['The Phantom Menace (disambiguation)'],
    allowTitles: ['Star Wars: Episode I – The Phantom Menace']
  },
  phantommenace: {
    queries: ['Star Wars: Episode I – The Phantom Menace'],
    rejectTitles: ['The Phantom Menace (disambiguation)'],
    allowTitles: ['Star Wars: Episode I – The Phantom Menace']
  },
  cartman: {
    queries: ['Eric Cartman'],
    rejectTitles: ['Cartman'],
    allowTitles: ['Eric Cartman']
  },
  dexterslab: {
    queries: ["Dexter's Laboratory"],
    rejectTitles: ['Dexter'],
    allowTitles: ["Dexter's Laboratory"]
  },
  cowardthecouragelydog: {
    queries: ['Courage the Cowardly Dog'],
    rejectTitles: ['Cowardly Dog'],
    allowTitles: ['Courage the Cowardly Dog']
  },
  couragethecouragelydog: {
    queries: ['Courage the Cowardly Dog'],
    rejectTitles: ['Cowardly Dog'],
    allowTitles: ['Courage the Cowardly Dog']
  },
  barbrastiesand: {
    queries: ['Barbra Streisand'],
    rejectTitles: ['Barbara Streisand'],
    allowTitles: ['Barbra Streisand']
  },
  barbrastreisand: {
    queries: ['Barbra Streisand'],
    rejectTitles: ['Barbara Streisand'],
    allowTitles: ['Barbra Streisand']
  },
  johndimaggio: {
    queries: ['John DiMaggio'],
    rejectTitles: ['John Dimaggio'],
    allowTitles: ['John DiMaggio']
  },
  frozone: {
    queries: ['Frozone', 'Lucius Best'],
    rejectTitles: ['Frozen', 'Frozone (disambiguation)'],
    allowTitles: ['Frozone', 'Lucius Best']
  },
  dash: {
    queries: ['Dash Parr', 'The Incredibles'],
    rejectTitles: ['Dash (disambiguation)'],
    allowTitles: ['Dash Parr', 'The Incredibles']
  },
  flash: {
    queries: ['The Flash (Barry Allen)', 'The Flash'],
    rejectTitles: ['Flash (disambiguation)'],
    allowTitles: ['The Flash (Barry Allen)', 'The Flash']
  },
  mrbeast: {
    queries: ['MrBeast', 'Jimmy Donaldson'],
    rejectTitles: ['Beast (disambiguation)'],
    allowTitles: ['MrBeast', 'Jimmy Donaldson']
  },
  bojackson: {
    queries: ['Bo Jackson'],
    rejectTitles: ['Bo Jackson (disambiguation)'],
    allowTitles: ['Bo Jackson']
  },
  dococ: {
    queries: ['Doctor Octopus', 'Doc Ock'],
    rejectTitles: ['Doc Gallows', 'Doc (wrestler)'],
    allowTitles: ['Doctor Octopus', 'Doctor Octopus (character)', 'Doc Ock']
  },
  docock: {
    queries: ['Doctor Octopus', 'Doc Ock'],
    rejectTitles: ['Doc Gallows', 'Doc (wrestler)'],
    allowTitles: ['Doctor Octopus', 'Doctor Octopus (character)', 'Doc Ock']
  },
  jerrysienfield: {
    queries: ['Jerry Seinfeld'],
    rejectTitles: ['Jerry Seinfeld (disambiguation)'],
    allowTitles: ['Jerry Seinfeld']
  },
  jerryseinfeld: {
    queries: ['Jerry Seinfeld'],
    rejectTitles: ['Jerry Seinfeld (disambiguation)'],
    allowTitles: ['Jerry Seinfeld']
  },
  peterparker: {
    queries: ['Peter Parker', 'Spider-Man', 'Spider-Man (character)'],
    rejectTitles: ['Peter Parker (disambiguation)', 'Spider-Man (disambiguation)'],
    allowTitles: ['Peter Parker', 'Spider-Man', 'Spider-Man (character)']
  },
  stitch: {
    queries: ['Stitch (Disney)', 'Stitch (Lilo & Stitch)', 'Stitch', 'Lilo & Stitch'],
    rejectTitles: ['Stitch (surgery)', 'Stitch (disambiguation)'],
    allowTitles: ['Stitch (Disney)', 'Stitch (Lilo & Stitch)', 'Stitch']
  },
  ronaldmcdonald: {
    queries: ['Ronald McDonald'],
    rejectTitles: ['McDonald (surname)'],
    allowTitles: ['Ronald McDonald']
  },
  dipperpines: {
    queries: ['Dipper Pines', 'Mabel Pines', 'Gravity Falls'],
    rejectTitles: ['Pines'],
    allowTitles: ['Dipper Pines']
  },
  luffy: {
    queries: ['Monkey D. Luffy', 'Luffy', 'One Piece'],
    rejectTitles: ['Luffy (disambiguation)'],
    allowTitles: ['Monkey D. Luffy', 'Luffy']
  },
  toothless: {
    queries: ['Toothless (How to Train Your Dragon)', 'Toothless', 'How to Train Your Dragon'],
    rejectTitles: ['How to Train Your Dragon (novel series)', 'Toothless George'],
    allowTitles: ['Toothless (How to Train Your Dragon)', 'Toothless']
  },
  po: {
    queries: ['Po (Kung Fu Panda)', 'Kung Fu Panda'],
    rejectTitles: ['Po Tat Estate', 'Po (river)'],
    allowTitles: ['Po (Kung Fu Panda)']
  },
  michaelangelo: {
    queries: ['Michelangelo (Teenage Mutant Ninja Turtles)', 'Michelangelo', 'Teenage Mutant Ninja Turtles'],
    rejectTitles: ['Michelangelo (artist)'],
    allowTitles: ['Michelangelo (Teenage Mutant Ninja Turtles)', 'Michelangelo']
  },
  gojosatoru: {
    queries: ['Satoru Gojo', 'Gojo Satoru'],
    rejectTitles: ['Gojo (disambiguation)'],
    allowTitles: ['Satoru Gojo']
  },
  naruto: {
    queries: ['Naruto Uzumaki', 'Naruto'],
    rejectTitles: ['Naruto (disambiguation)'],
    allowTitles: ['Naruto Uzumaki', 'Naruto']
  },
  therock: {
    queries: ['Dwayne Johnson', 'The Rock (professional wrestler)'],
    rejectTitles: ['The Rock (film)', 'Rock music'],
    allowTitles: ['Dwayne Johnson', 'The Rock (professional wrestler)']
  },
  dwaynejohnson: {
    queries: ['Dwayne Johnson'],
    rejectTitles: ['List of people with surname Johnson'],
    allowTitles: ['Dwayne Johnson']
  },
  themyscira: {
    queries: ['Themyscira', 'Wonder Woman'],
    rejectTitles: ['Black Adam'],
    allowTitles: ['Themyscira', 'Themyscira (DC Comics)']
  },
  hotcheetos: {
    queries: ["Flamin' Hot Cheetos", 'Cheetos'],
    rejectTitles: ['Chester Cheetah'],
    allowTitles: ["Flamin' Hot Cheetos", 'Cheetos']
  },
  neotokyo: {
    queries: ['Neo Tokyo', 'Akira (1988 film)', 'Akira'],
    rejectTitles: ['Neoplatonism'],
    allowTitles: ['Neo Tokyo', 'Akira (1988 film)', 'Akira']
  },
  crttv: {
    queries: ['Cathode-ray tube', 'Television set', 'Cathode-ray tube television'],
    rejectTitles: ['critical race theory'],
    allowTitles: []
  },
  crtmonitor: {
    queries: ['Cathode-ray tube', 'Computer monitor', 'CRT monitor'],
    rejectTitles: ['critical race theory'],
    allowTitles: []
  },
  crt: {
    queries: ['Cathode-ray tube', 'CRT'],
    rejectTitles: ['critical race theory'],
    allowTitles: ['Cathode-ray tube']
  },
  lcdscreen: {
    queries: ['Liquid-crystal display', 'LCD television', 'Display device'],
    rejectTitles: ['Nintendo DS'],
    allowTitles: []
  },
  lcd: {
    queries: ['Liquid-crystal display', 'LCD television'],
    rejectTitles: ['Nintendo DS'],
    allowTitles: ['Liquid-crystal display']
  },
  ufo: {
    queries: ['Unidentified flying object', 'UFO'],
    rejectTitles: ['Interdimensional UFO hypothesis'],
    allowTitles: ['Unidentified flying object', 'UFO']
  },
  got: {
    queries: ['Game of Thrones'],
    rejectTitles: [],
    allowTitles: ['Game of Thrones']
  },
  batarang: {
    queries: ['Batarang', 'Batman'],
    rejectTitles: ['Batarang (disambiguation)'],
    allowTitles: ['Batarang']
  },
  chucky: {
    queries: ['Chucky (character)', "Child's Play (franchise)"],
    rejectTitles: ['Chucky Brown'],
    allowTitles: ['Chucky (character)', 'Chucky']
  },
  ashitaka: {
    queries: ['Ashitaka (Princess Mononoke)', 'Princess Mononoke', 'Ashitaka'],
    rejectTitles: ['Mount Ashitaka'],
    allowTitles: ['Ashitaka', 'Princess Mononoke']
  },
  thedoctor: {
    queries: ['The Doctor (Doctor Who)', 'Doctor Who'],
    rejectTitles: ['Character actor'],
    allowTitles: ['The Doctor (Doctor Who)', 'Doctor Who']
  },
  thegoat: {
    queries: ['Greatest of all time', 'Goat'],
    rejectTitles: ['Three Billy Goats Gruff'],
    allowTitles: []
  },
  thedarkknight: {
    queries: ['Batman', 'The Dark Knight'],
    rejectTitles: [],
    allowTitles: ['Batman', 'The Dark Knight']
  },
  drdoom: {
    queries: ['Doctor Doom', 'Doctor Doom (character)'],
    rejectTitles: ['Doom: The Dark Ages'],
    allowTitles: ['Doctor Doom', 'Doctor Doom (character)']
  },
  kfcbucket: {
    queries: ['KFC', 'Kentucky Fried Chicken'],
    rejectTitles: ['I Love You, Colonel Sanders!'],
    allowTitles: ['KFC', 'Kentucky Fried Chicken']
  },
  bbqribs: {
    queries: ['Barbecue ribs', 'Ribs (food)', 'Barbecue'],
    rejectTitles: [],
    allowTitles: []
  },
  mrworldwide: {
    queries: ['Pitbull (rapper)', 'Pitbull'],
    rejectTitles: ['Mr.'],
    allowTitles: ['Pitbull (rapper)', 'Pitbull']
  },
  wakko: {
    queries: ['Wakko Warner', 'Animaniacs'],
    rejectTitles: [],
    allowTitles: ['Wakko Warner', 'Animaniacs']
  },
  alucard: {
    queries: ['Alucard (Hellsing)', 'Alucard', 'Hellsing'],
    rejectTitles: ['Alucard (disambiguation)'],
    allowTitles: ['Alucard (Hellsing)', 'Alucard']
  },
  bugsbunnyjr: {
    queries: ['Bugs Bunny', 'Looney Tunes'],
    rejectTitles: ['62nd Academy Awards'],
    allowTitles: ['Bugs Bunny']
  },
  saitma: {
    queries: ['Saitama', 'One-Punch Man'],
    rejectTitles: ['Kita-Saitama District, Saitama'],
    allowTitles: ['Saitama', 'One-Punch Man']
  },
  aquafina: {
    queries: ['Aquafina', 'Aquafina (brand)'],
    rejectTitles: ['fi', 'Aquila'],
    allowTitles: ['Aquafina']
  },
  aquaoshinoko: {
    queries: ['Aquamarine Hoshino', 'Aqua Hoshino', 'Oshi no Ko'],
    rejectTitles: ['Aqua', 'Aqua (color)', 'Aqua (disambiguation)', 'Water'],
    allowTitles: ['Aquamarine Hoshino', 'Aqua Hoshino', 'Oshi no Ko']
  },
  caesar: {
    queries: ['Julius Caesar', 'Caesar (title)', 'Caesar Augustus'],
    rejectTitles: ['Rome (TV series)'],
    allowTitles: ['Julius Caesar', 'Caesar (title)', 'Caesar Augustus']
  },
  colsanders: {
    queries: ['Colonel Sanders', 'KFC'],
    rejectTitles: ['Alessandro de Col'],
    allowTitles: ['Colonel Sanders']
  },
  cpu: {
    queries: ['Central processing unit', 'CPU'],
    rejectTitles: ['critical race theory'],
    allowTitles: ['Central processing unit', 'CPU']
  },
  croissantwich: {
    queries: ['Croissant sandwich', 'Croissant'],
    rejectTitles: ['Croissant (linguistic zone)'],
    allowTitles: ['Croissant sandwich', 'Croissant']
  },
  doomslayer: {
    queries: ['Doom Slayer', 'Doomguy', 'Doom (franchise)'],
    rejectTitles: ['Doomsayer'],
    allowTitles: ['Doom Slayer', 'Doomguy']
  },
  katniss: {
    queries: ['Katniss Everdeen', 'The Hunger Games'],
    rejectTitles: ['Sagittaria'],
    allowTitles: ['Katniss Everdeen']
  },
  ladygaga: {
    queries: ['Lady Gaga'],
    rejectTitles: ['Artpop'],
    allowTitles: ['Lady Gaga']
  },
  medivaltimes: {
    queries: ['Medieval Times'],
    rejectTitles: ['History of Morocco'],
    allowTitles: ['Medieval Times']
  },
  mochaccino: {
    queries: ['Mocha cappuccino', 'Cappuccino', 'Coffee'],
    rejectTitles: ['Colin Mochrie'],
    allowTitles: ['Mocha cappuccino', 'Cappuccino']
  },
  mountrainier: {
    queries: ['Mount Rainier'],
    rejectTitles: ['MF Ghost'],
    allowTitles: ['Mount Rainier']
  },
  n64: {
    queries: ['Nintendo 64', 'N64'],
    rejectTitles: ['Shadow Man (Michael LeRoi)'],
    allowTitles: ['Nintendo 64', 'N64']
  },
  poseidonstrident: {
    queries: ["Poseidon's trident", 'Trident', 'Poseidon'],
    rejectTitles: ["Assassin's Creed (novel series)"],
    allowTitles: ["Poseidon's trident", 'Trident', 'Poseidon']
  },
  quinoa: {
    queries: ['Quinoa'],
    rejectTitles: ['MrBeast'],
    allowTitles: ['Quinoa']
  },
  r2: {
    queries: ['R2-D2', 'Artoo-Detoo'],
    rejectTitles: ['R2'],
    allowTitles: ['R2-D2', 'Artoo-Detoo']
  },
  hakunamatata: {
    queries: ['Hakuna Matata', 'The Lion King'],
    rejectTitles: [],
    allowTitles: ['Hakuna Matata', 'The Lion King']
  },
  baymax: {
    queries: ['Baymax', 'Big Hero 6'],
    rejectTitles: ['Bruce Wayne'],
    allowTitles: ['Baymax', 'Big Hero 6']
  },
  jeangrey: {
    queries: ['Jean Grey', 'Phoenix (Marvel Comics)'],
    rejectTitles: ['Jean Grey (disambiguation)'],
    allowTitles: ['Jean Grey', 'Phoenix (Marvel Comics)']
  },
  johnwick: {
    queries: ['John Wick'],
    rejectTitles: ['John Wick (disambiguation)'],
    allowTitles: ['John Wick']
  },
  muhammadali: {
    queries: ['Muhammad Ali'],
    rejectTitles: ['Ali (disambiguation)'],
    allowTitles: ['Muhammad Ali']
  },
  muhhamadali: {
    queries: ['Muhammad Ali'],
    rejectTitles: ['Ali (disambiguation)'],
    allowTitles: ['Muhammad Ali']
  },
  rocky: {
    queries: ['Rocky Balboa', 'Rocky'],
    rejectTitles: ['Rocky (disambiguation)', 'Rocky Mountains'],
    allowTitles: ['Rocky Balboa', 'Rocky']
  },
  rockybalboa: {
    queries: ['Rocky Balboa', 'Rocky'],
    rejectTitles: ['Rocky (disambiguation)', 'Rocky Mountains'],
    allowTitles: ['Rocky Balboa', 'Rocky']
  },
  sukuna: {
    queries: ['Ryomen Sukuna', 'Sukuna'],
    rejectTitles: ['Sukuna (disambiguation)'],
    allowTitles: ['Ryomen Sukuna', 'Sukuna']
  },
  jakethedog: {
    queries: ['Jake the Dog', 'Adventure Time'],
    rejectTitles: ['Jake (disambiguation)'],
    allowTitles: ['Jake the Dog', 'Adventure Time']
  },
  jakedog: {
    queries: ['Jake the Dog', 'Adventure Time'],
    rejectTitles: ['Jake (disambiguation)'],
    allowTitles: ['Jake the Dog', 'Adventure Time']
  },
  danawhite: {
    queries: ['Dana White', 'Ultimate Fighting Championship'],
    rejectTitles: ['White (surname)', 'Dana (given name)'],
    allowTitles: ['Dana White', 'Ultimate Fighting Championship']
  },
  joerogan: {
    queries: ['Joe Rogan'],
    rejectTitles: ['Joe (singer)', 'Rogan (surname)'],
    allowTitles: ['Joe Rogan']
  },
  lebronjames: {
    queries: ['LeBron James'],
    rejectTitles: ['James (surname)'],
    allowTitles: ['LeBron James']
  },
  lebron: {
    queries: ['LeBron James'],
    rejectTitles: ['James (surname)'],
    allowTitles: ['LeBron James']
  },
  finnthehuman: {
    queries: ['Finn the Human', 'Adventure Time'],
    rejectTitles: ['Finn (disambiguation)'],
    allowTitles: ['Finn the Human', 'Adventure Time']
  },
  lordfarquad: {
    queries: ['Lord Farquaad'],
    rejectTitles: ['Shrek (disambiguation)'],
    allowTitles: ['Lord Farquaad']
  },
  lordfarquaad: {
    queries: ['Lord Farquaad'],
    rejectTitles: ['Shrek (disambiguation)'],
    allowTitles: ['Lord Farquaad']
  },
  krakenmyth: {
    queries: ['Kraken', 'Kraken (legendary creature)'],
    rejectTitles: ['The Kraken (disambiguation)'],
    allowTitles: ['Kraken', 'Kraken (legendary creature)']
  },
  sherlockh: {
    queries: ['Sherlock Holmes', 'Sherlock (TV series)'],
    rejectTitles: ['Sherlock (disambiguation)'],
    allowTitles: ['Sherlock Holmes', 'Sherlock (TV series)']
  },
  simbajr: {
    queries: ['Simba', 'The Lion King'],
    rejectTitles: ['Junior (disambiguation)'],
    allowTitles: ['Simba', 'The Lion King']
  },
  skyrim: {
    queries: ['The Elder Scrolls V: Skyrim', 'Skyrim'],
    rejectTitles: ['Max von Sydow'],
    allowTitles: ['The Elder Scrolls V: Skyrim', 'Skyrim']
  },
  spam: {
    queries: ['Spam (food)', 'Spam'],
    rejectTitles: ['Sam'],
    allowTitles: ['Spam (food)', 'Spam']
  },
  storm: {
    queries: ['Storm (Marvel Comics)', 'Storm', 'X-Men'],
    rejectTitles: ['Storm (disambiguation)'],
    allowTitles: ['Storm (Marvel Comics)', 'Storm']
  },
  thechosenone: {
    queries: ['Chosen one', 'Neo (The Matrix)', 'Anakin Skywalker'],
    rejectTitles: ['The Chosen One (novel)'],
    allowTitles: ['Chosen one', 'Neo (The Matrix)', 'Anakin Skywalker']
  },
  rdr2: {
    queries: ['Red Dead Redemption 2', 'Red Dead Redemption'],
    rejectTitles: ['RDR2: Companion'],
    allowTitles: ['Red Dead Redemption 2', 'Red Dead Redemption']
  },
  reddead: {
    queries: ['Red Dead Redemption', 'Red Dead Redemption 2'],
    rejectTitles: ['Red'],
    allowTitles: ['Red Dead Redemption', 'Red Dead Redemption 2']
  },
  lokivariant: {
    queries: ['Loki (Marvel Cinematic Universe)', 'Loki (TV series)', 'Loki'],
    rejectTitles: ['Frigga (character)'],
    allowTitles: ['Loki (Marvel Cinematic Universe)', 'Loki (TV series)', 'Loki']
  },
  magnetohelmet: {
    queries: ['Magneto', "Magneto's helmet", 'Magneto (Marvel Comics)'],
    rejectTitles: ['Magneto (disambiguation)'],
    allowTitles: ['Magneto', 'Magneto (Marvel Comics)']
  },
  tpain: {
    queries: ['T-Pain'],
    rejectTitles: ['Auto-Tune'],
    allowTitles: ['T-Pain']
  },
  billiee: {
    queries: ['Billie Eilish'],
    rejectTitles: ['The Personal Librarian'],
    allowTitles: ['Billie Eilish']
  },
  bluey: {
    queries: ['Bluey (2018 TV series)', 'Bluey'],
    rejectTitles: ['Bluey Wilkinson'],
    allowTitles: ['Bluey (2018 TV series)', 'Bluey']
  },
  macbook: {
    queries: ['MacBook', 'MacBook Pro', 'MacBook Air'],
    rejectTitles: ['Animal Farm'],
    allowTitles: ['MacBook', 'MacBook Pro', 'MacBook Air']
  },
  thethinker: {
    queries: ['The Thinker', 'Auguste Rodin'],
    rejectTitles: ['Archipelago'],
    allowTitles: ['The Thinker']
  },
  capncrunch: {
    queries: ["Cap'n Crunch", 'Captain Crunch'],
    rejectTitles: ["Cap'n Jazz"],
    allowTitles: ["Cap'n Crunch", 'Captain Crunch']
  },
  dobby: {
    queries: ['Dobby (Harry Potter)', 'Dobby'],
    rejectTitles: ['Dobby (disambiguation)'],
    allowTitles: ['Dobby (Harry Potter)', 'Dobby']
  },
  drax: {
    queries: ['Drax (character)', 'Drax the Destroyer', 'Guardians of the Galaxy'],
    rejectTitles: ['Drax (disambiguation)'],
    allowTitles: ['Drax (character)', 'Drax the Destroyer', 'Drax']
  },
  erenyeager: {
    queries: ['Eren Yeager', 'Eren Jaeger', 'Attack on Titan'],
    rejectTitles: ['Yeager'],
    allowTitles: ['Eren Yeager', 'Eren Jaeger']
  },
  grootjr: {
    queries: ['Groot', 'Baby Groot'],
    rejectTitles: ['Groot (disambiguation)'],
    allowTitles: ['Groot', 'Baby Groot']
  },
  hotfudge: {
    queries: ['Hot fudge'],
    rejectTitles: [],
    allowTitles: ['Hot fudge']
  },
  ichigo: {
    queries: ['Ichigo Kurosaki', 'Ichigo', 'Bleach (TV series)'],
    rejectTitles: ['Ichigo (disambiguation)'],
    allowTitles: ['Ichigo Kurosaki', 'Ichigo']
  },
  ladyliberty: {
    queries: ['Statue of Liberty', 'Lady Liberty'],
    rejectTitles: ['Lady Pink'],
    allowTitles: ['Statue of Liberty', 'Lady Liberty']
  },
  mountfujisan: {
    queries: ['Mount Fuji'],
    rejectTitles: ['Heidi Mount'],
    allowTitles: ['Mount Fuji']
  },
  pepsimax: {
    queries: ['Pepsi Max', 'Pepsi Zero Sugar'],
    rejectTitles: ['Pepsi Max (disambiguation)'],
    allowTitles: ['Pepsi Max', 'Pepsi Zero Sugar']
  },
  zeldabotw: {
    queries: ['The Legend of Zelda: Breath of the Wild', 'Breath of the Wild'],
    rejectTitles: ['Zelda (disambiguation)'],
    allowTitles: ['The Legend of Zelda: Breath of the Wild', 'Breath of the Wild']
  },
  yennefer: {
    queries: ['Yennefer of Vengerberg', 'Yennefer'],
    rejectTitles: ['Yennefer (disambiguation)'],
    allowTitles: ['Yennefer of Vengerberg', 'Yennefer']
  },
  thorinoakenshield: {
    queries: ['Thorin Oakenshield', 'Thorin'],
    rejectTitles: ['Thorin (disambiguation)'],
    allowTitles: ['Thorin Oakenshield', 'Thorin']
  },
  hadesunderworld: {
    queries: ['Hades', 'Greek underworld', 'Underworld'],
    rejectTitles: ['Macaria (daughter of Hades)'],
    allowTitles: ['Hades', 'Greek underworld', 'Underworld']
  },
  cybertron: {
    queries: ['Cybertron', 'Transformers'],
    rejectTitles: ['Cyberpunk'],
    allowTitles: ['Cybertron', 'Transformers']
  },
  wakandan: {
    queries: ['Wakanda', 'Wakandan'],
    rejectTitles: ['Advanced Idea Mechanics'],
    allowTitles: ['Wakanda', 'Wakandan']
  },
  detectiveconan: {
    queries: ['Detective Conan', 'Case Closed', 'Conan Edogawa'],
    rejectTitles: ['Detective Conan: Police Academy Arc', 'Detective Conan (disambiguation)'],
    allowTitles: ['Detective Conan', 'Case Closed', 'Conan Edogawa']
  },
  detectivepikachu: {
    queries: ['Detective Pikachu', 'Detective Pikachu (video game)', 'Detective Pikachu (film)'],
    rejectTitles: ['Pikachu (disambiguation)'],
    allowTitles: ['Detective Pikachu', 'Detective Pikachu (video game)', 'Detective Pikachu (film)']
  },
  perrytheplatypus: {
    queries: ['Perry the Platypus', 'Agent P', 'Phineas and Ferb'],
    rejectTitles: ['Platypus', 'Platypus (disambiguation)'],
    allowTitles: ['Perry the Platypus', 'Agent P']
  },
  monkeyddragon: {
    queries: ['Monkey D. Dragon', 'Monkey D Dragon', 'One Piece'],
    rejectTitles: ['Monkey (character)', 'Monkey'],
    allowTitles: ['Monkey D. Dragon', 'Monkey D Dragon']
  },
  drwatson: {
    queries: ['Dr. Watson', 'John Watson', 'Doctor Watson'],
    rejectTitles: ['Watson (disambiguation)'],
    allowTitles: ['Dr. Watson', 'John Watson', 'Doctor Watson']
  },
  aceventura: {
    queries: ['Ace Ventura', 'Ace Ventura: Pet Detective'],
    rejectTitles: ['Ace Ventura (disambiguation)'],
    allowTitles: ['Ace Ventura', 'Ace Ventura: Pet Detective']
  },
  loidforger: {
    queries: ['Loid Forger', 'Twilight (Spy x Family)', 'Spy x Family'],
    rejectTitles: ['Loid (disambiguation)'],
    allowTitles: ['Loid Forger', 'Twilight (Spy x Family)']
  },
  bmo: {
    queries: ['BMO (Adventure Time)', 'Adventure Time'],
    rejectTitles: ['Bank of Montreal', 'Islands (miniseries)'],
    allowTitles: ['BMO (Adventure Time)', 'Adventure Time']
  },
  margotrobbie: {
    queries: ['Margot Robbie', 'Margot Elise Robbie'],
    rejectTitles: ['Margot', 'Margot (disambiguation)'],
    allowTitles: ['Margot Robbie', 'Margot Elise Robbie']
  },
  natskisubaru: {
    queries: ['Natsuki Subaru', 'Subaru Natsuki', 'Re:Zero'],
    rejectTitles: ['Subaru', 'Subaru (disambiguation)', 'Subaru Corporation', 'Subaru (name)'],
    allowTitles: ['Natsuki Subaru', 'Subaru Natsuki']
  },
  natsukisubaru: {
    queries: ['Natsuki Subaru', 'Subaru Natsuki', 'Re:Zero'],
    rejectTitles: ['Subaru', 'Subaru (disambiguation)', 'Subaru Corporation', 'Subaru (name)'],
    allowTitles: ['Natsuki Subaru', 'Subaru Natsuki']
  },
  emiyashirou: {
    queries: ['Shirou Emiya', 'Fate/stay night'],
    rejectTitles: ['Bishōjo game', 'Bishoujo game', 'Visual novel'],
    allowTitles: ['Shirou Emiya']
  },
  kiritsugushirou: {
    queries: ['Kiritsugu Emiya', 'Fate/Zero'],
    rejectTitles: ['Shirou Emiya', 'Bishōjo game', 'Bishoujo game', 'Visual novel'],
    allowTitles: ['Kiritsugu Emiya']
  },
  charilechaplin: {
    queries: ['Charlie Chaplin'],
    rejectTitles: ['Chaplin (disambiguation)'],
    allowTitles: ['Charlie Chaplin']
  },
  charliechaplin: {
    queries: ['Charlie Chaplin'],
    rejectTitles: ['Chaplin (disambiguation)'],
    allowTitles: ['Charlie Chaplin']
  }
};

const FAST_KNOWN_ENTITY_RECORDS = Object.freeze({
  masseffect: {
    title: 'Mass Effect',
    aliases: ['Mass Effect', 'Mass Effect franchise', 'Commander Shepard'],
    categories: ['science fiction franchise', 'space opera', 'video game franchise'],
    description: 'Mass Effect is a science fiction space-opera video game franchise about interstellar exploration, alien species, military command, survival decisions, and galaxy-scale technology.',
    confidence: 0.9
  },
  starwars: {
    title: 'Star Wars',
    aliases: ['Star Wars', 'Star Wars franchise', 'Star Wars universe'],
    categories: ['science fiction franchise', 'space opera', 'film franchise'],
    description: 'Star Wars is a science fiction space-opera franchise centered on galactic conflict, starships, alien worlds, Jedi strategy, survival, and large-scale adventure.',
    confidence: 0.92
  },
  batman: {
    title: 'Batman',
    aliases: ['Batman', 'Bruce Wayne', 'The Dark Knight'],
    categories: ['DC Comics superhero', 'detective', 'martial artist', 'Justice League'],
    description: 'Batman is Bruce Wayne, a DC Comics superhero and detective known for tactical planning, investigation, stealth, martial arts, gadgets, intimidation, and crisis leadership.',
    confidence: 0.92
  },
  superman: {
    title: 'Superman',
    aliases: ['Superman', 'Clark Kent', 'Kal-El'],
    categories: ['DC Comics superhero', 'Justice League', 'Kryptonian'],
    description: 'Superman is a DC Comics superhero with flight, super strength, speed, durability, heat vision, rescue instincts, moral restraint, and broad public trust.',
    confidence: 0.93
  },
  spiderman: {
    title: 'Spider-Man',
    aliases: ['Spider-Man', 'Peter Parker', 'Miles Morales'],
    categories: ['Marvel Comics superhero', 'Avengers', 'web-slinger'],
    description: 'Spider-Man is a Marvel superhero known for agility, wall-crawling, spider-sense, web shooters, improvisation, rescue work, and strong responsibility under pressure.',
    confidence: 0.91
  },
  narutouzumaki: {
    title: 'Naruto Uzumaki',
    aliases: ['Naruto Uzumaki', 'Naruto'],
    categories: ['anime protagonist', 'Naruto', 'shinobi', 'ninja'],
    description: 'Naruto Uzumaki is the Naruto anime and manga protagonist, a shinobi with shadow clones, chakra control, resilience, leadership growth, mobility, and high-pressure combat instincts.',
    confidence: 0.9
  },
  naruto: {
    title: 'Naruto Uzumaki',
    aliases: ['Naruto', 'Naruto Uzumaki'],
    categories: ['anime protagonist', 'Naruto', 'shinobi', 'ninja'],
    description: 'Naruto is treated as Naruto Uzumaki, the shinobi protagonist known for shadow clones, chakra control, resilience, mobility, leadership growth, and high-pressure combat instincts.',
    confidence: 0.88
  },
  monkeydluffy: {
    title: 'Monkey D. Luffy',
    aliases: ['Monkey D. Luffy', 'Luffy', 'Straw Hat Luffy'],
    categories: ['anime protagonist', 'One Piece', 'pirate captain'],
    description: 'Monkey D. Luffy is the One Piece protagonist and Straw Hat captain, known for rubber-like powers, extreme endurance, combat creativity, leadership, loyalty, and pirate adventure instincts.',
    confidence: 0.9
  },
  luffy: {
    title: 'Monkey D. Luffy',
    aliases: ['Luffy', 'Monkey D. Luffy', 'Straw Hat Luffy'],
    categories: ['anime protagonist', 'One Piece', 'pirate captain'],
    description: 'Luffy is treated as Monkey D. Luffy, the One Piece protagonist known for rubber-like powers, endurance, combat creativity, leadership, loyalty, and pirate adventure instincts.',
    confidence: 0.88
  },
  goku: {
    title: 'Goku',
    aliases: ['Goku', 'Son Goku', 'Dragon Ball'],
    categories: ['anime protagonist', 'Dragon Ball', 'martial artist', 'Saiyan'],
    description: 'Goku is the Dragon Ball martial artist and Saiyan hero known for superhuman strength, speed, energy attacks, battle adaptation, training discipline, and tournament combat.',
    confidence: 0.9
  },
  aang: {
    title: 'Aang',
    aliases: ['Aang', 'Avatar Aang', 'Avatar: The Last Airbender'],
    categories: ['animated hero', 'Avatar', 'airbender', 'elemental magic'],
    description: 'Aang is the Avatar: The Last Airbender hero, an airbender and Avatar with elemental bending, mobility, diplomacy, spiritual awareness, restraint, and team leadership.',
    confidence: 0.88
  },
  elsa: {
    title: 'Elsa',
    aliases: ['Elsa', 'Queen Elsa', 'Frozen'],
    categories: ['Disney character', 'Frozen', 'ice magic', 'queen'],
    description: 'Elsa is the Frozen queen with powerful ice magic, environmental control, emotional discipline, resilience, leadership duties, and strong protective instincts.',
    confidence: 0.86
  },
  mario: {
    title: 'Mario',
    aliases: ['Mario', 'Super Mario', 'Mario Mario'],
    categories: ['video game character', 'Nintendo', 'platforming hero'],
    description: 'Mario is Nintendo Super Mario hero, known for platforming agility, jumping skill, durability, power-up use, rescue missions, kart racing, sports, and adaptable problem-solving.',
    confidence: 0.88
  },
  link: {
    title: 'Link',
    aliases: ['Link', 'The Legend of Zelda', 'Hero of Hyrule'],
    categories: ['video game character', 'The Legend of Zelda', 'swordsman', 'adventurer'],
    description: 'Link is The Legend of Zelda hero, a swordsman and adventurer known for courage, puzzle solving, archery, tools, exploration, monster fighting, and survival instincts.',
    confidence: 0.88
  },
  ashketchum: {
    title: 'Ash Ketchum',
    aliases: ['Ash Ketchum', 'Pokemon Trainer Ash', 'Satoshi'],
    categories: ['anime protagonist', 'Pokemon', 'trainer'],
    description: 'Ash Ketchum is the Pokemon anime trainer known for creature strategy, improvisation, team bonding, travel endurance, competitive battling, and persistent tournament growth.',
    confidence: 0.86
  },
  spongebobsquarepants: {
    title: 'SpongeBob SquarePants',
    aliases: ['SpongeBob SquarePants', 'SpongeBob'],
    categories: ['animated character', 'Nickelodeon', 'undersea comedy'],
    description: 'SpongeBob SquarePants is an animated Nickelodeon character known for optimism, resilience, fast learning, unusual durability, teamwork, cooking skill, and chaotic problem-solving.',
    confidence: 0.86
  },
  spongebob: {
    title: 'SpongeBob SquarePants',
    aliases: ['SpongeBob', 'SpongeBob SquarePants'],
    categories: ['animated character', 'Nickelodeon', 'undersea comedy'],
    description: 'SpongeBob is treated as SpongeBob SquarePants, an animated character known for optimism, resilience, unusual durability, teamwork, cooking skill, and chaotic problem-solving.',
    confidence: 0.84
  },
  hermionegranger: {
    title: 'Hermione Granger',
    aliases: ['Hermione Granger', 'Hermione', 'Harry Potter'],
    categories: ['Harry Potter character', 'witch', 'student leader'],
    description: 'Hermione Granger is a Harry Potter character and skilled witch known for intelligence, research, spellcraft, planning, moral courage, loyalty, and rapid problem-solving.',
    confidence: 0.9
  },
  johnwick: {
    title: 'John Wick',
    aliases: ['John Wick', 'Baba Yaga'],
    categories: ['action film character', 'assassin', 'crime thriller franchise'],
    description: 'John Wick is a fictional action-thriller assassin known for elite combat skill, tactical focus, weapons mastery, endurance, and improvising under pressure.',
    confidence: 0.86
  },
  indianajones: {
    title: 'Indiana Jones',
    aliases: ['Indiana Jones', 'Henry Jones Jr.'],
    categories: ['adventure film character', 'archaeologist', 'explorer', 'field survival', 'expedition leader'],
    description: 'Indiana Jones is an adventure-film archaeologist and expedition leader known for field survival, navigation, ancient-site investigation, limited-supply improvisation, hazard response, and practical problem-solving.',
    confidence: 0.9
  },
  serenawilliams: {
    title: 'Serena Williams',
    aliases: ['Serena Williams'],
    categories: ['tennis', 'athlete', 'champion'],
    description: 'Serena Williams is a real tennis champion known for elite power, serve quality, competitive resilience, athletic discipline, pressure performance, and tactical court awareness.',
    confidence: 0.92
  },
  cleopatra: {
    title: 'Cleopatra',
    aliases: ['Cleopatra', 'Cleopatra VII'],
    categories: ['historical figure', 'Egyptian queen', 'political leader'],
    description: 'Cleopatra VII was a historical Egyptian queen known for political strategy, diplomacy, multilingual intelligence, alliance building, cultural leadership, and high-stakes crisis rule.',
    confidence: 0.9
  },
  joanofarc: {
    title: 'Joan of Arc',
    aliases: ['Joan of Arc', 'Jeanne d Arc'],
    categories: ['historical figure', 'military leader', 'saint'],
    description: 'Joan of Arc was a historical French military figure known for morale leadership, battlefield courage, religious conviction, symbolic influence, and crisis-era command presence.',
    confidence: 0.9
  },
  alberteinstein: {
    title: 'Albert Einstein',
    aliases: ['Albert Einstein', 'Einstein'],
    categories: ['scientist', 'physicist', 'theorist'],
    description: 'Albert Einstein was a real theoretical physicist known for relativity, scientific reasoning, creativity, mathematical insight, problem framing, and deep conceptual analysis.',
    confidence: 0.94
  },
  katnisseverdeen: {
    title: 'Katniss Everdeen',
    aliases: ['Katniss Everdeen', 'Katniss', 'The Hunger Games'],
    categories: ['fictional heroine', 'The Hunger Games', 'archer', 'survivor'],
    description: 'Katniss Everdeen is The Hunger Games heroine known for archery, survival skills, stealth, resourcefulness, moral resolve, public symbolism, and resistance leadership.',
    confidence: 0.88
  },
  laracroft: {
    title: 'Lara Croft',
    aliases: ['Lara Croft', 'Tomb Raider'],
    categories: ['video game character', 'archaeologist', 'adventurer'],
    description: 'Lara Croft is the Tomb Raider adventurer known for archaeology, climbing, marksmanship, puzzle solving, survival, exploration, and physical resilience under danger.',
    confidence: 0.88
  },
  captainpicard: {
    title: 'Jean-Luc Picard',
    aliases: ['Captain Picard', 'Jean-Luc Picard', 'Star Trek'],
    categories: ['science fiction character', 'Star Trek', 'starship captain'],
    description: 'Captain Picard is Jean-Luc Picard from Star Trek, known for diplomacy, command judgment, strategic restraint, exploration, negotiation, ethics, and starship leadership.',
    confidence: 0.9
  },
  jeanlucpicard: {
    title: 'Jean-Luc Picard',
    aliases: ['Jean-Luc Picard', 'Captain Picard', 'Star Trek'],
    categories: ['science fiction character', 'Star Trek', 'starship captain'],
    description: 'Jean-Luc Picard is a Star Trek captain known for diplomacy, command judgment, strategic restraint, exploration, negotiation, ethics, and starship leadership.',
    confidence: 0.9
  },
  theflash: {
    title: 'The Flash (Barry Allen)',
    aliases: ['The Flash', 'Barry Allen', 'Flash'],
    categories: ['DC Comics superhero', 'speedster', 'Justice League'],
    description: 'The Flash is a DC Comics superhero and Justice League speedster with superhuman speed, rapid reaction time, rescue ability, and time/physics-adjacent comic-book powers.',
    confidence: 0.9
  },
  flash: {
    title: 'The Flash (Barry Allen)',
    aliases: ['The Flash', 'Barry Allen', 'Flash'],
    categories: ['DC Comics superhero', 'speedster', 'Justice League'],
    description: 'The Flash is a DC Comics superhero and Justice League speedster with superhuman speed, rapid reaction time, rescue ability, and time/physics-adjacent comic-book powers.',
    confidence: 0.88
  },
  wonderwoman: {
    title: 'Wonder Woman',
    aliases: ['Wonder Woman', 'Diana Prince'],
    categories: ['DC Comics superhero', 'Justice League', 'Amazon warrior'],
    description: 'Wonder Woman is a DC Comics superhero and Justice League member with Amazon combat skill, durability, leadership, flight, and diplomatic judgment.',
    confidence: 0.9
  },
  wolverine: {
    title: 'Wolverine',
    aliases: ['Wolverine', 'Logan', 'James Howlett'],
    categories: ['Marvel Comics superhero', 'X-Men', 'mutant'],
    description: 'Wolverine is a Marvel Comics X-Men mutant with adamantium claws, accelerated healing, heightened senses, combat experience, survival instincts, and relentless close-quarters fighting.',
    confidence: 0.9
  },
  blackpanther: {
    title: 'Black Panther',
    aliases: ['Black Panther', "T'Challa", 'Wakanda'],
    categories: ['Marvel Comics superhero', 'Avengers', 'Wakandan king'],
    description: 'Black Panther is a Marvel superhero and Wakandan ruler known for enhanced physical ability, vibranium technology, stealth, martial arts, strategy, diplomacy, and leadership.',
    confidence: 0.9
  },
  doctorstrange: {
    title: 'Doctor Strange',
    aliases: ['Doctor Strange', 'Stephen Strange', 'Dr. Strange'],
    categories: ['Marvel Comics superhero', 'sorcerer', 'Avengers'],
    description: 'Doctor Strange is a Marvel sorcerer and former surgeon with mystic arts, portals, protective spells, medical knowledge, dimensional awareness, and strategic crisis management.',
    confidence: 0.9
  },
  drstrange: {
    title: 'Doctor Strange',
    aliases: ['Dr. Strange', 'Doctor Strange', 'Stephen Strange'],
    categories: ['Marvel Comics superhero', 'sorcerer', 'Avengers'],
    description: 'Dr. Strange is treated as Doctor Strange, a Marvel sorcerer with mystic arts, portals, protective spells, medical knowledge, dimensional awareness, and strategic crisis management.',
    confidence: 0.88
  },
  greenlantern: {
    title: 'Green Lantern',
    aliases: ['Green Lantern', 'Hal Jordan', 'John Stewart'],
    categories: ['DC Comics superhero', 'Justice League', 'power ring'],
    description: 'Green Lantern is a DC Comics superhero identity powered by a will-based ring, known for flight, energy constructs, space operations, discipline, and emergency response.',
    confidence: 0.88
  },
  raven: {
    title: 'Raven',
    aliases: ['Raven', 'Rachel Roth', 'Teen Titans'],
    categories: ['DC Comics superhero', 'Teen Titans', 'empath', 'magic'],
    description: 'Raven is a DC Comics and Teen Titans hero with empathic power, shadow magic, teleportation, defensive barriers, emotional control, and supernatural combat ability.',
    confidence: 0.86
  },
  deadpool: {
    title: 'Deadpool',
    aliases: ['Deadpool', 'Wade Wilson'],
    categories: ['Marvel Comics antihero', 'mercenary', 'mutant'],
    description: 'Deadpool is Marvel antihero Wade Wilson, known for healing factor, weapons skill, improvisational combat, endurance, tactical unpredictability, and irreverent problem-solving.',
    confidence: 0.88
  },
  ironman: {
    title: 'Iron Man',
    aliases: ['Iron Man', 'Tony Stark'],
    categories: ['Marvel Comics superhero', 'Avengers', 'inventor', 'powered armor'],
    description: 'Iron Man is Tony Stark, a Marvel superhero and engineer with powered armor, advanced weapons systems, tactical computing, flight, leadership, and crisis-response technology.',
    confidence: 0.92
  },
  starfire: {
    title: 'Starfire (Teen Titans)',
    aliases: ['Starfire', "Koriand'r", 'Teen Titans'],
    categories: ['DC Comics superhero', 'Teen Titans', 'alien princess'],
    description: 'Starfire is a DC Comics and Teen Titans superhero with flight, energy projection, alien durability, combat ability, and team-centered decision-making.',
    confidence: 0.86
  },
  muhammadali: {
    title: 'Muhammad Ali',
    aliases: ['Muhammad Ali', 'Cassius Clay'],
    categories: ['boxing', 'combat sports', 'heavyweight champion'],
    description: 'Muhammad Ali was a real heavyweight boxing champion and combat-sports icon known for elite striking, footwork, endurance, showmanship, and tactical ring intelligence.',
    confidence: 0.93
  },
  muhhamadali: {
    title: 'Muhammad Ali',
    aliases: ['Muhammad Ali', 'Muhhamad Ali', 'Cassius Clay'],
    categories: ['boxing', 'combat sports', 'heavyweight champion'],
    description: 'Muhhamad Ali is treated as a typo for Muhammad Ali, the real heavyweight boxing champion and combat-sports icon known for striking, footwork, endurance, and tactical ring intelligence.',
    confidence: 0.9
  },
  rocky: {
    title: 'Rocky Balboa',
    aliases: ['Rocky', 'Rocky Balboa'],
    categories: ['fictional boxer', 'boxing film character', 'sports drama'],
    description: 'Rocky Balboa is a fictional boxer from the Rocky films, defined by boxing training, stamina, grit, comeback mentality, and ring toughness.',
    confidence: 0.82
  },
  rockybalboa: {
    title: 'Rocky Balboa',
    aliases: ['Rocky Balboa', 'Rocky'],
    categories: ['fictional boxer', 'boxing film character', 'sports drama'],
    description: 'Rocky Balboa is a fictional boxer from the Rocky films, defined by boxing training, stamina, grit, comeback mentality, and ring toughness.',
    confidence: 0.84
  },
  sukuna: {
    title: 'Ryomen Sukuna',
    aliases: ['Sukuna', 'Ryomen Sukuna', 'Jujutsu Kaisen'],
    categories: ['anime villain', 'Jujutsu Kaisen', 'cursed spirit'],
    description: 'Ryomen Sukuna is a Jujutsu Kaisen antagonist with supernatural combat power, domain techniques, ruthless strategy, and high adaptability.',
    confidence: 0.84
  },
  jakethedog: {
    title: 'Jake the Dog',
    aliases: ['Jake the Dog', 'Jake', 'Adventure Time'],
    categories: ['animated character', 'Adventure Time', 'shape-shifter'],
    description: 'Jake the Dog is an Adventure Time hero with magical stretching, shapeshifting, loyalty, improvisation, and relaxed problem-solving under strange conditions.',
    confidence: 0.84
  },
  jakedog: {
    title: 'Jake the Dog',
    aliases: ['Jake the Dog', 'Jake', 'Adventure Time'],
    categories: ['animated character', 'Adventure Time', 'shape-shifter'],
    description: 'Jake the Dog is an Adventure Time hero with magical stretching, shapeshifting, loyalty, improvisation, and relaxed problem-solving under strange conditions.',
    confidence: 0.82
  },
  danawhite: {
    title: 'Dana White',
    aliases: ['Dana White', 'UFC president', 'Ultimate Fighting Championship'],
    categories: ['combat sports executive', 'UFC', 'mixed martial arts promoter'],
    description: 'Dana White is a real combat-sports executive and UFC president tied to mixed martial arts promotion, fight matchmaking, event logistics, fighter assessment, and media commentary.',
    confidence: 0.88
  },
  joerogan: {
    title: 'Joe Rogan',
    aliases: ['Joe Rogan', 'UFC commentator', 'martial arts commentator'],
    categories: ['UFC commentator', 'martial arts', 'podcaster', 'combat sports media'],
    description: 'Joe Rogan is a real UFC commentator, podcaster, and martial-arts practitioner known for fight analysis, live commentary, interviewing, and broad combat-sports literacy.',
    confidence: 0.86
  },
  lebronjames: {
    title: 'LeBron James',
    aliases: ['LeBron James', 'LeBron'],
    categories: ['basketball', 'NBA athlete', 'team sports'],
    description: 'LeBron James is a real NBA basketball player known for athleticism, leadership, court vision, endurance, and team-sports performance.',
    confidence: 0.9
  },
  lebron: {
    title: 'LeBron James',
    aliases: ['LeBron James', 'LeBron'],
    categories: ['basketball', 'NBA athlete', 'team sports'],
    description: 'LeBron James is a real NBA basketball player known for athleticism, leadership, court vision, endurance, and team-sports performance.',
    confidence: 0.86
  },
  finnthehuman: {
    title: 'Finn the Human',
    aliases: ['Finn the Human', 'Finn', 'Adventure Time'],
    categories: ['animated character', 'Adventure Time', 'hero'],
    description: 'Finn the Human is an Adventure Time hero known for courage, sword-fighting, rescue instincts, moral decision-making, and adaptability in surreal fantasy situations.',
    confidence: 0.84
  },
  ben10: {
    title: 'Ben 10',
    aliases: ['Ben 10', 'Ben Tennyson', 'Omnitrix'],
    categories: ['animated superhero', 'science fiction', 'alien transformations'],
    description: 'Ben 10 is an animated science-fiction superhero franchise/character built around the Omnitrix, alien transformations, improvisation, rescue action, and adapting to bizarre threats.',
    confidence: 0.86
  },
  brucelee: {
    title: 'Bruce Lee',
    aliases: ['Bruce Lee', 'Lee Jun-fan'],
    categories: ['martial artist', 'actor', 'combat performer'],
    description: 'Bruce Lee was a martial artist, actor, and martial-arts innovator known for speed, discipline, combat skill, film performance, and physical control outside elected government office.',
    confidence: 0.88
  },
  kinghenry: {
    title: 'Henry VIII of England',
    aliases: ['King Henry', 'Henry VIII', 'Henry VIII of England'],
    categories: ['monarch', 'king', 'world leader', 'head of state'],
    description: 'King Henry is resolved as Henry VIII of England, a real monarch and head of state whose reign involved government leadership, dynastic politics, religious policy, and state power.',
    confidence: 0.84
  },
  saber: {
    title: 'Saber (Fate/stay night)',
    aliases: ['Saber', 'Artoria Pendragon', 'Fate/stay night'],
    categories: ['anime character', 'Fate/stay night', 'fictional knight'],
    description: 'Saber is Artoria Pendragon from Fate/stay night, a fictional heroic spirit and knight with sword combat, discipline, Arthurian command motifs, and magical endurance.',
    confidence: 0.84
  },
  saberfatestay: {
    title: 'Saber (Fate/stay night)',
    aliases: ['Saber', 'Artoria Pendragon', 'Fate/stay night'],
    categories: ['anime character', 'Fate/stay night', 'fictional knight'],
    description: 'Saber (Fate Stay) is Artoria Pendragon from Fate/stay night, a fictional heroic spirit and knight with sword combat, discipline, leadership motifs, and magical endurance.',
    confidence: 0.86
  },
  saberfatestaynight: {
    title: 'Saber (Fate/stay night)',
    aliases: ['Saber', 'Artoria Pendragon', 'Fate/stay night'],
    categories: ['anime character', 'Fate/stay night', 'fictional knight'],
    description: 'Saber (Fate/stay night) is Artoria Pendragon, a fictional heroic spirit and knight with sword combat, discipline, leadership motifs, and magical endurance.',
    confidence: 0.88
  },
  donaldtrump: {
    title: 'Donald Trump',
    aliases: ['Donald Trump', 'President Donald Trump'],
    categories: ['president', 'world leader', 'politician', 'head of state'],
    description: 'Donald Trump is a real United States president and political leader associated with executive government, public persuasion, crisis messaging, state policy, and high-pressure political decision-making.',
    confidence: 0.9
  },
  teddyroosevelt: {
    title: 'Theodore Roosevelt',
    aliases: ['Teddy Roosevelt', 'Theodore Roosevelt', 'President Roosevelt'],
    categories: ['president', 'world leader', 'politician', 'head of state'],
    description: 'Teddy Roosevelt is Theodore Roosevelt, a real United States president and world leader known for executive leadership, public charisma, crisis action, reform politics, and outdoor toughness.',
    confidence: 0.9
  },
  theodoreroosevelt: {
    title: 'Theodore Roosevelt',
    aliases: ['Theodore Roosevelt', 'Teddy Roosevelt', 'President Roosevelt'],
    categories: ['president', 'world leader', 'politician', 'head of state'],
    description: 'Theodore Roosevelt was a real United States president and world leader known for executive leadership, public charisma, crisis action, reform politics, and outdoor toughness.',
    confidence: 0.92
  },
  jfk: {
    title: 'John F. Kennedy',
    aliases: ['JFK', 'John F. Kennedy', 'John Fitzgerald Kennedy'],
    categories: ['president', 'world leader', 'politician', 'head of state'],
    description: 'JFK is John F. Kennedy, a real United States president and world leader known for executive decision-making, public communication, crisis leadership, and Cold War statecraft.',
    confidence: 0.9
  },
  johnfkennedy: {
    title: 'John F. Kennedy',
    aliases: ['John F. Kennedy', 'John Fitzgerald Kennedy', 'JFK'],
    categories: ['president', 'world leader', 'politician', 'head of state'],
    description: 'John F. Kennedy was a real United States president and world leader known for executive decision-making, public communication, crisis leadership, and Cold War statecraft.',
    confidence: 0.92
  },
  lordfarquad: {
    title: 'Lord Farquaad',
    aliases: ['Lord Farquaad', 'Lord Farquad', 'Duloc'],
    categories: ['fictional ruler', 'Shrek character', 'animated villain'],
    description: 'Lord Farquad is treated as a typo for Lord Farquaad, the fictional ruler of Duloc from Shrek. He has authoritarian command traits in an animated fantasy setting.',
    confidence: 0.82
  },
  lordfarquaad: {
    title: 'Lord Farquaad',
    aliases: ['Lord Farquaad', 'Duloc'],
    categories: ['fictional ruler', 'Shrek character', 'animated villain'],
    description: 'Lord Farquaad is the fictional ruler of Duloc from Shrek. He has authoritarian command traits in an animated fantasy setting.',
    confidence: 0.84
  }
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueResolverStrings(values = [], limit = 24) {
  const out = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeName(value);
    const key = canonicalizeName(normalized);
    if (!normalized || !key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out.slice(0, limit);
}

function resolveFastKnownEntityRecord(character) {
  const compact = canonicalizeName(character);
  if (!compact) return null;
  if (FAST_KNOWN_ENTITY_RECORDS[compact]) {
    return { key: compact, record: FAST_KNOWN_ENTITY_RECORDS[compact] };
  }
  const leetCompact = canonicalizeName(String(character || '')
    .replace(/[0]/g, 'o')
    .replace(/[1]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't'));
  if (leetCompact && FAST_KNOWN_ENTITY_RECORDS[leetCompact]) {
    return { key: leetCompact, record: FAST_KNOWN_ENTITY_RECORDS[leetCompact] };
  }
  return null;
}

function buildFastKnownEntityInfo(character, fetchOptions = {}, existingInfo = null) {
  const hit = resolveFastKnownEntityRecord(character);
  if (!hit || !hit.record) return null;
  const record = hit.record;
  const title = normalizeName(record.title || character);
  const existingRealImage = existingInfo && existingInfo.imageUrl && !existingInfo.imageSynthetic
    ? existingInfo.imageUrl
    : null;
  const aliases = uniqueResolverStrings([
    character,
    title,
    ...(Array.isArray(record.aliases) ? record.aliases : [])
  ]);
  const categories = uniqueResolverStrings(Array.isArray(record.categories) ? record.categories : [], 18);
  const confidence = Math.max(0.72, Math.min(0.96, Number(record.confidence) || 0.82));
  return {
    source: 'known-entity-index',
    title,
    description: normalizeName(record.description || `${title} resolved from the built-in known entity index.`),
    categories,
    aliases,
    confidence,
    confidenceBand: confidence >= 0.86 ? 'high' : 'medium',
    imageUrl: existingRealImage || null,
    imageSynthetic: false,
    lookupMeta: {
      ...(existingInfo && existingInfo.lookupMeta && typeof existingInfo.lookupMeta === 'object' ? existingInfo.lookupMeta : {}),
      knownEntityIndex: true,
      knownEntityKey: hit.key,
      externalSource: existingInfo && existingInfo.source ? existingInfo.source : null,
      mode: fetchOptions && fetchOptions.mode ? fetchOptions.mode : undefined
    }
  };
}

function fetchedInfoIsStrongEnoughForKnownEntity(character, fetchedInfo, knownInfo) {
  if (!fetchedInfo || typeof fetchedInfo !== 'object') return false;
  const source = String(fetchedInfo.source || '').toLowerCase();
  if (fetchedInfo.timeoutFallback || source.includes('fast-fallback') || source.includes('name-only')) return false;
  if (source.includes('generic-name-fallback') || source.includes('low-signal-ambiguity')) return false;

  const confidence = Number(fetchedInfo.confidence) || 0;
  const descLen = String(fetchedInfo.description || '').replace(/\s+/g, ' ').trim().length;
  const titleCompact = canonicalizeName(fetchedInfo.title || fetchedInfo.name);
  const knownTitleCompact = canonicalizeName(knownInfo && knownInfo.title);
  const inputCompact = canonicalizeName(character);
  const knownKey = knownInfo && knownInfo.lookupMeta ? String(knownInfo.lookupMeta.knownEntityKey || '') : '';
  const titleMatchesKnown = Boolean(titleCompact && knownTitleCompact && titleCompact === knownTitleCompact);
  const titleMatchesInput = Boolean(titleCompact && inputCompact && titleCompact === inputCompact);
  const realImage = Boolean(fetchedInfo.imageUrl && !fetchedInfo.imageSynthetic);

  if ((knownKey === 'rocky' || knownKey === 'rockybalboa') && !titleMatchesKnown) return false;
  if ((titleMatchesKnown || titleMatchesInput) && confidence >= 0.72 && descLen >= 70) return true;
  if (source.includes('wikipedia') && confidence >= 0.76 && descLen >= 90) return true;
  if (realImage && confidence >= 0.78 && descLen >= 75) return true;
  return false;
}

function chooseKnownEntityFloor(character, fetchedInfo, knownInfo, fetchOptions = {}) {
  if (!knownInfo) return fetchedInfo;
  if (fetchedInfoIsStrongEnoughForKnownEntity(character, fetchedInfo, knownInfo)) return fetchedInfo;
  return buildFastKnownEntityInfo(character, fetchOptions, fetchedInfo) || knownInfo;
}

function normalizeComparableName(raw = '') {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’`]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeComparableName(raw = '') {
  const normalized = normalizeComparableName(raw);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

function aliasMapLinksInputAndResolved(inputName = '', resolvedTitle = '') {
  const inputNorm = normalizeComparableName(inputName);
  const resolvedNorm = normalizeComparableName(resolvedTitle);
  if (!inputNorm || !resolvedNorm) return false;
  const inputCompact = inputNorm.replace(/[^a-z0-9]/g, '');
  const resolvedCompact = resolvedNorm.replace(/[^a-z0-9]/g, '');

  const clusters = [];
  [inputNorm, inputCompact, resolvedNorm, resolvedCompact].forEach((key) => {
    const aliases = CHARACTER_NAME_ALIASES[key];
    if (Array.isArray(aliases) && aliases.length) {
      clusters.push([key, ...aliases]);
    }
  });

  return clusters.some((cluster) => {
    const normalizedCluster = new Set(
      cluster
        .map((value) => normalizeComparableName(value))
        .filter(Boolean)
    );
    return normalizedCluster.has(inputNorm) && normalizedCluster.has(resolvedNorm);
  });
}

function tokenEditDistance(a = '', b = '') {
  const left = String(a || '');
  const right = String(b || '');
  if (!left) return right.length;
  if (!right) return left.length;

  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function tokensLikelyTypoEquivalent(inputTokens = [], resolvedTokens = []) {
  if (!Array.isArray(inputTokens) || !Array.isArray(resolvedTokens)) return false;
  if (!inputTokens.length || inputTokens.length !== resolvedTokens.length) return false;

  const allPairsClose = inputTokens.every((token, index) => {
    const left = String(token || '');
    const right = String(resolvedTokens[index] || '');
    if (!left || !right) return false;
    if (left === right) return true;
    const distance = tokenEditDistance(left, right);
    const maxLen = Math.max(left.length, right.length);
    if (maxLen <= 4) return distance <= 1;
    return distance <= 2;
  });

  return allPairsClose;
}

function isBenignTitleDifference(inputName = '', resolvedTitle = '') {
  const input = String(inputName || '').trim();
  const resolved = String(resolvedTitle || '').trim();
  if (!input || !resolved) return false;

  const inputCompact = canonicalizeName(input);
  const resolvedCompact = canonicalizeName(resolved);
  if (inputCompact && resolvedCompact && inputCompact === resolvedCompact) {
    return true;
  }

  const inputNoParens = canonicalizeName(input.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  const resolvedNoParens = canonicalizeName(resolved.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  if (
    (inputNoParens && inputNoParens === resolvedCompact)
    || (resolvedNoParens && resolvedNoParens === inputCompact)
    || (inputNoParens && resolvedNoParens && inputNoParens === resolvedNoParens)
  ) {
    return true;
  }

  const inputTokens = tokenizeComparableName(input);
  const resolvedTokens = tokenizeComparableName(resolved);
  if (inputTokens.length && resolvedTokens.length && inputTokens.length === resolvedTokens.length) {
    const inputSet = new Set(inputTokens);
    const resolvedSet = new Set(resolvedTokens);
    const sameMembers = inputTokens.every((token) => resolvedSet.has(token))
      && resolvedTokens.every((token) => inputSet.has(token));
    if (sameMembers) return true;

    const resolvedAligned = resolvedTokens.slice();
    const inputAligned = inputTokens.slice();
    if (tokensLikelyTypoEquivalent(inputAligned, resolvedAligned)) return true;

    const resolvedSorted = resolvedTokens.slice().sort();
    const inputSorted = inputTokens.slice().sort();
    if (tokensLikelyTypoEquivalent(inputSorted, resolvedSorted)) return true;
  }

  return aliasMapLinksInputAndResolved(input, resolved);
}

function buildSyntheticPortraitDataUri(label) {
  const text = String(label || '?').trim() || '?';
  const compact = canonicalizeName(text) || 'entry';
  let hash = 0;
  for (let i = 0; i < compact.length; i += 1) {
    hash = ((hash << 5) - hash) + compact.charCodeAt(i);
    hash |= 0;
  }
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 46) % 360;
  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || text.slice(0, 2).toUpperCase();
  const safeInitials = String(initials).replace(/[<>&"]/g, '');
  const safeLabel = text.slice(0, 20).replace(/[<>&"]/g, '');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">',
    '<defs>',
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hueA} 62% 54%)"/><stop offset="100%" stop-color="hsl(${hueB} 72% 42%)"/></linearGradient>`,
    '</defs>',
    '<rect width="640" height="480" fill="url(#g)"/>',
    '<circle cx="520" cy="92" r="64" fill="rgba(255,255,255,0.14)"/>',
    '<circle cx="108" cy="388" r="86" fill="rgba(255,255,255,0.08)"/>',
    `<text x="320" y="238" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="138" font-weight="700" fill="white">${safeInitials}</text>`,
    `<text x="320" y="420" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="28" font-weight="600" fill="rgba(255,255,255,0.92)">${safeLabel}</text>`,
    '</svg>'
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function cloneJsonSafe(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function getImageBackfillCache(key) {
  const cacheKey = String(key || '');
  const cached = IMAGE_BACKFILL_CACHE.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > IMAGE_BACKFILL_TTL_MS) {
    IMAGE_BACKFILL_CACHE.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setImageBackfillCache(key, value) {
  const cacheKey = String(key || '');
  if (!cacheKey) return;
  IMAGE_BACKFILL_CACHE.set(cacheKey, {
    value,
    timestamp: Date.now()
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), Math.max(50, Number(timeoutMs) || 250)))
  ]);
}

function buildDeadlineAt(fetchOptions = {}, {
  deadlineKey,
  budgetKey,
  fallbackBudgetMs = 0
} = {}) {
  const explicitDeadline = Number(fetchOptions && deadlineKey ? fetchOptions[deadlineKey] : 0);
  if (Number.isFinite(explicitDeadline) && explicitDeadline > 0) return explicitDeadline;
  const explicitBudget = Number(fetchOptions && budgetKey ? fetchOptions[budgetKey] : 0);
  if (Number.isFinite(explicitBudget) && explicitBudget > 0) {
    return Date.now() + explicitBudget;
  }
  if (Number.isFinite(Number(fallbackBudgetMs)) && Number(fallbackBudgetMs) > 0) {
    return Date.now() + Number(fallbackBudgetMs);
  }
  return 0;
}

function deadlineExpired(deadlineAt) {
  return Number.isFinite(Number(deadlineAt)) && Number(deadlineAt) > 0 && Date.now() >= Number(deadlineAt);
}

function buildFastRoundTimeoutFallbackInfo(character, fetchOptions = {}) {
  const text = String(character || '').trim() || 'Unknown Entry';
  const mode = String(fetchOptions.mode || '').toLowerCase();
  return {
    source: mode === 'round' ? 'round-fast-fallback' : 'context-fast-fallback',
    title: text,
    description: `Fast round fallback profile for ${text}. Ambiguous or slow lookup was bypassed to preserve round pacing; contextual scoring is derived from the entry text and current scenario/twist.`,
    categories: ['ambiguous-entry', 'fallback-profile'],
    aliases: [text],
    confidence: 0.34,
    confidenceBand: 'low',
    imageUrl: CONTEXT_SYNTHETIC_IMAGE_FALLBACK ? buildSyntheticPortraitDataUri(text) : null,
    imageSynthetic: CONTEXT_SYNTHETIC_IMAGE_FALLBACK,
    timeoutFallback: true,
    lookupMeta: {
      fastRoundTimeoutMs: ROUND_RESOLVE_TIMEOUT_MS
    }
  };
}

function buildGenericNameAmbiguityFallbackInfo(character, existingInfo = null) {
  const text = String(character || '').trim() || 'Unknown';
  return {
    source: 'generic-name-fallback',
    title: text,
    description: `Ambiguous single-name entry for "${text}". Resolver intentionally avoided over-specific page matching and is treating this as a generic person/character profile unless the user specifies more detail.`,
    categories: ['ambiguous-entry', 'generic-name'],
    aliases: [text],
    confidence: 0.42,
    confidenceBand: 'low',
    imageUrl: existingInfo && existingInfo.imageUrl ? existingInfo.imageUrl : (CONTEXT_SYNTHETIC_IMAGE_FALLBACK ? buildSyntheticPortraitDataUri(text) : null),
    imageSynthetic: true,
    genericAmbiguityFallback: true,
    lookupMeta: {
      ...(existingInfo && existingInfo.lookupMeta && typeof existingInfo.lookupMeta === 'object' ? existingInfo.lookupMeta : {}),
      ambiguityFallback: 'generic_name'
    }
  };
}

function buildInvalidInputFallbackInfo(character, reason = 'invalid') {
  const text = String(character || '').trim() || 'Unknown';
  return {
    source: 'invalid-input-fallback',
    title: text,
    description: `Resolver skipped high-specificity lookup for invalid input (${String(reason || 'invalid')}).`,
    categories: ['invalid-entry', 'fallback-profile'],
    aliases: [text],
    confidence: 0.22,
    confidenceBand: 'low',
    imageUrl: null,
    imageSynthetic: false,
    invalidInputFallback: true,
    lookupMeta: {
      validationReason: String(reason || 'invalid')
    }
  };
}

function hasAliasHintForCompact(compact = '') {
  const key = canonicalizeName(compact);
  const leetKey = canonicalizeName(String(compact || '')
    .replace(/[0]/g, 'o')
    .replace(/[1]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't'));
  if (!key && !leetKey) return false;
  return Boolean(
    IMAGE_BACKFILL_ALIAS_HINTS[key]
    || RESOLUTION_ALIAS_OVERRIDES[key]
    || IMAGE_BACKFILL_ALIAS_HINTS[leetKey]
    || RESOLUTION_ALIAS_OVERRIDES[leetKey]
  );
}

function buildLowSignalAmbiguityFallbackInfo(character, existingInfo = null) {
  const text = String(character || '').trim() || 'Unknown';
  const existingConfidence = Number(existingInfo && existingInfo.confidence);
  const fallbackConfidence = Number.isFinite(existingConfidence)
    ? Math.max(0.3, Math.min(0.42, existingConfidence))
    : 0.38;
  return {
    source: 'low-signal-ambiguity-fallback',
    title: text,
    description: `Low-signal entry "${text}" resolved conservatively. Resolver avoided over-specific matching due to weak lexical evidence and is treating this as ambiguous until more identifying detail is provided.`,
    categories: ['ambiguous-entry', 'low-signal-input'],
    aliases: [text],
    confidence: fallbackConfidence,
    confidenceBand: 'low',
    imageUrl: existingInfo && existingInfo.imageUrl
      ? existingInfo.imageUrl
      : (CONTEXT_SYNTHETIC_IMAGE_FALLBACK ? buildSyntheticPortraitDataUri(text) : null),
    imageSynthetic: true,
    lowSignalAmbiguityFallback: true,
    lookupMeta: {
      ...(existingInfo && existingInfo.lookupMeta && typeof existingInfo.lookupMeta === 'object' ? existingInfo.lookupMeta : {}),
      ambiguityFallback: 'low_signal_input'
    }
  };
}

async function fetchCharacterInfoWithRoundBudget(character, fetchOptions = {}) {
  const isRoundMode = String(fetchOptions.mode || '').toLowerCase() === 'round';
  const hasRoundBudget = Number(fetchOptions && fetchOptions.roundResolveTimeoutMs) > 0;
  const isFastRound = isRoundMode && fetchOptions.fastRoundMode !== false;
  const shouldUseResolveBudget = (
    (isRoundMode && isFastRound)
    || hasRoundBudget
    || fetchOptions.roundQualityPass === true
  );
  if (!shouldUseResolveBudget) {
    return fetchCharacterInfo(character, fetchOptions);
  }

  const timeoutMs = Math.max(250, Number(fetchOptions.roundResolveTimeoutMs) || ROUND_RESOLVE_TIMEOUT_MS);
  const knownFloor = fetchOptions.forceRefresh ? null : buildFastKnownEntityInfo(character, fetchOptions);
  if (knownFloor) {
    const probeTimeoutMs = Math.max(
      300,
      Math.min(
        timeoutMs,
        Number(fetchOptions && fetchOptions.roundKnownEntityProbeMs) || (fetchOptions.roundQualityPass === true ? 1350 : 650)
      )
    );
    const probeTimeoutToken = { __knownProbeTimeout: true };
    const probed = await Promise.race([
      fetchCharacterInfo(character, fetchOptions).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(probeTimeoutToken), probeTimeoutMs))
    ]);
    if (probed && probed !== probeTimeoutToken) {
      return chooseKnownEntityFloor(character, probed, knownFloor, fetchOptions);
    }
    return knownFloor;
  }

  let timedOut = false;
  const timeoutToken = { __timeout: true };
  const fetched = await Promise.race([
    fetchCharacterInfo(character, fetchOptions).catch(() => null),
    new Promise((resolve) => setTimeout(() => {
      timedOut = true;
      resolve(timeoutToken);
    }, timeoutMs))
  ]);

  if (fetched && fetched !== timeoutToken) return fetched;
  if (timedOut) {
    return buildFastRoundTimeoutFallbackInfo(character, fetchOptions);
  }
  return fetched;
}

function shouldAttemptImageBackfill(info, fetchOptions) {
  if (!info || info.imageUrl) return false;
  if (fetchOptions && fetchOptions.skipImageBackfill === true) return false;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode !== 'round' && mode !== 'final' && mode !== 'context') return false;
  const confidence = Number(info && info.confidence);
  const compactInput = canonicalizeName(fetchOptions && fetchOptions.character);
  const compactTitle = canonicalizeName(info && (info.title || info.name));
  const hasAliasHint = Boolean(
    (compactInput && (IMAGE_BACKFILL_ALIAS_HINTS[compactInput] || RESOLUTION_ALIAS_OVERRIDES[compactInput]))
    || (compactTitle && (IMAGE_BACKFILL_ALIAS_HINTS[compactTitle] || RESOLUTION_ALIAS_OVERRIDES[compactTitle]))
  );
  if (Number.isFinite(confidence) && confidence < 0.35 && !(mode === 'final' && hasAliasHint)) return false;
  return true;
}

function attachSyntheticImageIfNeeded(character, info, fetchOptions = {}) {
  if (!CONTEXT_SYNTHETIC_IMAGE_FALLBACK) return info;
  if (!info || info.imageUrl) return info;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode !== 'round' && mode !== 'final' && mode !== 'context') return info;
  return {
    ...info,
    imageUrl: buildSyntheticPortraitDataUri((info && info.title) || character || 'Entry'),
    imageSynthetic: true
  };
}

function applyGenericNameAmbiguityFallback(character, info, fetchOptions = {}) {
  if (!info || typeof info !== 'object') return info;
  const compact = canonicalizeName(character);
  const tokenCount = String(character || '').trim().split(/\s+/).filter(Boolean).length;
  if (!compact || tokenCount !== 1) return info;
  if (!GENERIC_NAME_AMBIGUITY_FALLBACK.has(compact)) return info;
  if (IMAGE_BACKFILL_ALIAS_HINTS[compact] || RESOLUTION_ALIAS_OVERRIDES[compact]) return info;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  const title = String(info.title || '').trim();
  if (!title) return buildGenericNameAmbiguityFallbackInfo(character, info);
  if (canonicalizeName(title) === compact) return info;
  const lookupMeta = info.lookupMeta && typeof info.lookupMeta === 'object' ? info.lookupMeta : null;
  const candidateCount = Number(lookupMeta && lookupMeta.candidateCount);
  const source = String(info.source || '').toLowerCase();
  const confidence = Number(info.confidence);
  const likelyAmbiguous = (
    (Number.isFinite(candidateCount) && candidateCount >= 6)
    || source.includes('search')
    || (!Number.isFinite(confidence) || confidence < 0.8)
  );
  if (!likelyAmbiguous && mode !== 'round') return info;
  return buildGenericNameAmbiguityFallbackInfo(character, info);
}

function shouldApplyLowSignalAmbiguityFallback(character, info) {
  if (!info || typeof info !== 'object') return false;
  if (info.genericAmbiguityFallback || info.lowSignalAmbiguityFallback) return false;
  const profile = buildResolverInputProfile(character);
  const source = String(info.source || '').toLowerCase();
  const confidence = Number(info.confidence);
  const titleCompact = canonicalizeName(info.title || info.name || '');
  const inputCompact = profile.compact;
  const hasAliasHint = hasAliasHintForCompact(inputCompact) || hasAliasHintForCompact(titleCompact);
  const lowTokenCount = (profile.tokens || []).length <= 1;
  const compactLen = String(inputCompact || '').length;
  const shortSimpleToken = compactLen > 0 && (compactLen <= 4 || (/^[a-z]+$/.test(inputCompact) && compactLen <= 6));
  const weakSource = source.includes('search') || source === 'local-index';
  const titleDiffers = titleCompact && inputCompact && titleCompact !== inputCompact;
  const noisyToken = profile.hasDigit || profile.hasSymbolNoise;
  const weakLexicalSignal = profile.vowelPoor || noisyToken;
  const confidenceIsHigh = Number.isFinite(confidence) && confidence >= 0.72;
  if (!lowTokenCount || !shortSimpleToken) return false;
  if (!weakSource || !titleDiffers) return false;
  if (hasAliasHint) return false;
  if (profile.likelyTechObject || profile.likelyFood || profile.likelyPlaceLandmark || profile.likelyQuote) return false;
  if (confidenceIsHigh && !weakLexicalSignal) return false;
  return true;
}

function applyLowSignalAmbiguityFallback(character, info, fetchOptions = {}) {
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode === 'round' || mode === 'final' || mode === 'context') {
    if (shouldApplyLowSignalAmbiguityFallback(character, info)) {
      return buildLowSignalAmbiguityFallbackInfo(character, info);
    }
  }
  return info;
}

function buildImageBackfillQueries({ character, info, fetchOptions = {} }) {
  const lookupMeta = info && info.lookupMeta && typeof info.lookupMeta === 'object' ? info.lookupMeta : null;
  const resolution = lookupMeta && lookupMeta.resolution && typeof lookupMeta.resolution === 'object'
    ? lookupMeta.resolution
    : null;
  const infoAliases = Array.isArray(info && info.aliases) ? info.aliases.slice(0, 10) : [];
  const rawQueries = [
    character,
    info && info.title,
    resolution && resolution.matchedAlias,
    resolution && resolution.canonical,
    ...infoAliases
  ];

  const queries = [];
  const preferredAliasQueries = [];
  const primaryCompacts = [
    canonicalizeName(character),
    canonicalizeName(info && info.title)
  ].filter(Boolean);
  for (const compact of primaryCompacts) {
    if (!IMAGE_BACKFILL_ALIAS_HINTS[compact]) continue;
    const aliases = Array.isArray(IMAGE_BACKFILL_ALIAS_HINTS[compact])
      ? IMAGE_BACKFILL_ALIAS_HINTS[compact]
      : [IMAGE_BACKFILL_ALIAS_HINTS[compact]];
    aliases.forEach((alias) => preferredAliasQueries.push(normalizeName(alias)));
  }

  [...preferredAliasQueries, ...rawQueries].forEach((value) => {
    const normalized = normalizeName(value);
    if (!normalized) return;
    queries.push(normalized);

    const noArticle = normalizeName(String(normalized).replace(/^(a|an|the)\s+/i, ''));
    if (noArticle && noArticle.toLowerCase() !== normalized.toLowerCase()) {
      queries.push(noArticle);
    }

    const compact = canonicalizeName(normalized);
    if (compact && IMAGE_BACKFILL_ALIAS_HINTS[compact]) {
      const aliases = Array.isArray(IMAGE_BACKFILL_ALIAS_HINTS[compact])
        ? IMAGE_BACKFILL_ALIAS_HINTS[compact]
        : [IMAGE_BACKFILL_ALIAS_HINTS[compact]];
      aliases.forEach((alias) => queries.push(normalizeName(alias)));
    }
  });

  const description = String(info && info.description || '').toLowerCase();
  const titleSeed = normalizeName((info && info.title) || character);
  if (titleSeed) {
    if (/television series|tv series|animated series|cartoon/.test(description)) {
      queries.push(`${titleSeed} (TV series)`);
      queries.push(`${titleSeed} (character)`);
    }
    if (/video game|game/.test(description)) {
      queries.push(`${titleSeed} (video game)`);
    }
    if (/film|movie/.test(description)) {
      queries.push(`${titleSeed} (film)`);
    }
  }
  if (/fictional character|superhero|villain|anime|manga|comic/.test(description)) {
    const preferred = normalizeName((resolution && resolution.canonical) || (infoAliases[0]) || titleSeed || character);
    if (preferred) {
      queries.push(`${preferred} (character)`);
      queries.push(`${preferred} (comics)`);
    }
  }

  const out = [];
  const seen = new Set();
  for (const query of queries) {
    const key = canonicalizeName(query);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
  }
  const mode = String((fetchOptions && fetchOptions.mode) || (info && info.lookupMeta && info.lookupMeta.mode) || '').toLowerCase();
  const maxQueries = Math.max(
    1,
    Math.min(
      10,
      Number(fetchOptions && fetchOptions.maxImageBackfillQueries)
      || (mode === 'round' ? 4 : mode === 'context' ? 7 : 8)
    )
  );
  return out.slice(0, maxQueries);
}

async function tryBackfillImage(character, info, fetchOptions = {}) {
  if (!shouldAttemptImageBackfill(info, fetchOptions)) return info;
  const cacheKey = JSON.stringify({
    c: canonicalizeName(character),
    t: canonicalizeName(info && info.title),
    s: String(info && info.source || '').toLowerCase()
  });

  const cached = getImageBackfillCache(cacheKey);
  if (cached && cached.imageUrl) {
    return { ...info, imageUrl: cached.imageUrl, imageBackfilled: true };
  }
  if (IMAGE_BACKFILL_INFLIGHT.has(cacheKey)) {
    const joinTimeoutMs = Math.max(150, Number(fetchOptions && fetchOptions.imageBackfillTimeoutMs) || IMAGE_BACKFILL_TIMEOUT_MS);
    const inflight = await withTimeout(IMAGE_BACKFILL_INFLIGHT.get(cacheKey), joinTimeoutMs);
    return inflight && inflight.imageUrl ? { ...info, imageUrl: inflight.imageUrl, imageBackfilled: true } : info;
  }

  const contextHints = Array.isArray(fetchOptions.contextHints) ? fetchOptions.contextHints : [];
  const entityHints = Array.isArray(fetchOptions.entityHints) ? fetchOptions.entityHints : [];
  const queries = buildImageBackfillQueries({ character, info, fetchOptions });
  const source = String(info && info.source || '').toLowerCase();
  const quickMode = source.includes('wikipedia') || source.includes('wikidata');
  const baseTimeout = Math.max(150, Number(fetchOptions && fetchOptions.imageBackfillTimeoutMs) || IMAGE_BACKFILL_TIMEOUT_MS);
  const deadlineAt = buildDeadlineAt(fetchOptions, {
    deadlineKey: 'imageBackfillDeadlineAt',
    budgetKey: 'imageBackfillBudgetMs'
  });
  const exactTimeout = quickMode ? Math.min(900, baseTimeout) : baseTimeout;
  const searchTimeout = quickMode ? Math.min(1000, baseTimeout) : baseTimeout;
  const summaryTimeout = quickMode ? Math.min(1200, baseTimeout) : Math.min(1200, baseTimeout);

  const task = (async () => {
    for (const query of queries) {
      const trySummaryFirst = Boolean(fetchOptions && fetchOptions.preferSummaryFirst)
        || (String((fetchOptions && fetchOptions.mode) || '').toLowerCase() === 'final' && quickMode);
      if (trySummaryFirst) {
        if (deadlineExpired(deadlineAt)) break;
        const summary = await withTimeout(fetchFromWikipediaSummary(query), summaryTimeout);
        if (summary && summary.imageUrl) {
          const payload = { imageUrl: summary.imageUrl, source: 'wiki-summary' };
          setImageBackfillCache(cacheKey, payload);
          return payload;
        }
      }

      if (deadlineExpired(deadlineAt)) break;
      const exact = await withTimeout(fetchFromWikipediaEnhanced(query), exactTimeout);
      if (exact && exact.imageUrl) {
        const payload = { imageUrl: exact.imageUrl, source: 'wiki-exact' };
        setImageBackfillCache(cacheKey, payload);
        return payload;
      }

      if (deadlineExpired(deadlineAt)) break;
      const searched = await withTimeout(
        fetchFromWikipediaSearchEnhanced(query, contextHints.slice(0, 2), entityHints.slice(0, 2)),
        searchTimeout
      );
      if (searched && searched.imageUrl) {
        const payload = { imageUrl: searched.imageUrl, source: 'wiki-search' };
        setImageBackfillCache(cacheKey, payload);
        return payload;
      }

      if (!trySummaryFirst) {
        if (deadlineExpired(deadlineAt)) break;
        const summary = await withTimeout(fetchFromWikipediaSummary(query), summaryTimeout);
        if (summary && summary.imageUrl) {
          const payload = { imageUrl: summary.imageUrl, source: 'wiki-summary' };
          setImageBackfillCache(cacheKey, payload);
          return payload;
        }
      }
    }

    setImageBackfillCache(cacheKey, null);
    return null;
  })();

  IMAGE_BACKFILL_INFLIGHT.set(cacheKey, task);
  try {
    const resolved = await task;
    if (resolved && resolved.imageUrl) {
      return {
        ...info,
        imageUrl: resolved.imageUrl,
        imageBackfilled: true
      };
    }
    return info;
  } finally {
    IMAGE_BACKFILL_INFLIGHT.delete(cacheKey);
  }
}

async function tryUpgradeSyntheticImage(character, info, fetchOptions = {}) {
  if (!info || !info.imageSynthetic) return info;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode === 'round' && !fetchOptions.roundQualityPass) return info;
  const confidence = Number(info && info.confidence);
  if (Number.isFinite(confidence) && confidence < 0.32) return info;
  const compact = canonicalizeName((info && (info.title || info.name)) || character);
  const inputCompact = canonicalizeName(character);
  const titleWordCount = String(info && (info.title || info.name) || character || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
  const hasAliasHints = Boolean(
    (compact && IMAGE_BACKFILL_ALIAS_HINTS[compact])
    || (inputCompact && IMAGE_BACKFILL_ALIAS_HINTS[inputCompact])
  );
  const source = String(info && info.source || '').toLowerCase();
  const knownEntitySource = source.includes('known-entity-index');
  const requestedImageTimeoutMs = Math.max(
    300,
    Number(fetchOptions && fetchOptions.imageBackfillTimeoutMs) || IMAGE_BACKFILL_TIMEOUT_MS
  );
  const requestedImageBudgetMs = Math.max(
    300,
    Number(fetchOptions && fetchOptions.imageBackfillBudgetMs) || FINAL_SYNTHETIC_UPGRADE_TIMEOUT_MS
  );
  const trustedSpecificWiki = (mode === 'final' || mode === 'context')
    && titleWordCount >= 2
    && confidence >= (mode === 'final' ? 0.72 : 0.76)
    && (source.includes('wikipedia') || source.includes('wiki'));
  const trustedKnownEntity = (mode === 'final' || mode === 'context')
    && knownEntitySource
    && confidence >= (mode === 'final' ? 0.72 : 0.78);
  const prefersAliasIdentity = hasAliasHints
    && confidence >= (mode === 'final' ? 0.52 : 0.6);
  const preferQualityUpgrade = (mode === 'final' || mode === 'context')
    && (hasAliasHints || trustedSpecificWiki || trustedKnownEntity)
    && !((inputCompact && FAST_ROUND_GENERIC_NAME_SKIP_ALIAS.has(inputCompact)) || (compact && FAST_ROUND_GENERIC_NAME_SKIP_ALIAS.has(compact)))
    && !(titleWordCount <= 1 && !hasAliasHints && !trustedKnownEntity);

  const stripped = {
    ...info,
    imageUrl: null
  };
  const upgradeOptions = {
    ...fetchOptions,
    skipImageBackfill: false,
    imageBackfillTimeoutMs: mode === 'final'
      ? (preferQualityUpgrade ? Math.max(900, Math.min(1800, requestedImageTimeoutMs)) : Math.min(650, Math.max(550, requestedImageTimeoutMs)))
      : (preferQualityUpgrade || prefersAliasIdentity ? Math.max(700, IMAGE_BACKFILL_TIMEOUT_MS) : IMAGE_BACKFILL_TIMEOUT_MS),
    maxImageBackfillQueries: mode === 'final'
      ? (preferQualityUpgrade ? Math.max(3, Math.min(6, Number(fetchOptions && fetchOptions.maxImageBackfillQueries) || 4)) : 2)
      : (preferQualityUpgrade || prefersAliasIdentity ? 5 : 4),
    imageBackfillBudgetMs: mode === 'final'
      ? (preferQualityUpgrade ? Math.max(1100, Math.min(2200, requestedImageBudgetMs)) : Math.min(700, Math.max(550, requestedImageBudgetMs)))
      : (preferQualityUpgrade || prefersAliasIdentity ? Math.max(800, FINAL_SYNTHETIC_UPGRADE_TIMEOUT_MS) : 0),
    preferSummaryFirst: Boolean(preferQualityUpgrade || knownEntitySource)
  };
  const upgraded = await withTimeout(
    tryBackfillImage(character, stripped, upgradeOptions),
    mode === 'final'
      ? (preferQualityUpgrade ? Math.max(1100, Math.min(2200, Number(upgradeOptions.imageBackfillBudgetMs) || requestedImageBudgetMs)) : requestedImageBudgetMs)
      : Math.max(500, Number(upgradeOptions.imageBackfillBudgetMs) || FINAL_SYNTHETIC_UPGRADE_TIMEOUT_MS)
  );
  if (upgraded && upgraded.imageUrl) {
    return {
      ...upgraded,
      imageSynthetic: false
    };
  }
  return info;
}

async function tryUpgradeLowFidelityIdentity(character, info, fetchOptions = {}) {
  if (!info || typeof info !== 'object') return info;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();

  const source = String(info.source || '').toLowerCase();
  const title = String(info.title || '').trim();
  const confidence = Number(info.confidence);
  const lowConfidence = Number.isFinite(confidence) ? confidence < 0.7 : true;
  const genericSingleToken = /^[A-Za-z]+$/.test(title) && title.split(/\s+/).length <= 1;
  const inputCompact = canonicalizeName(character);
  const titleCompact = canonicalizeName(title);
  const hasAliasHint = Boolean(
    (inputCompact && (IMAGE_BACKFILL_ALIAS_HINTS[inputCompact] || RESOLUTION_ALIAS_OVERRIDES[inputCompact]))
    || (titleCompact && (IMAGE_BACKFILL_ALIAS_HINTS[titleCompact] || RESOLUTION_ALIAS_OVERRIDES[titleCompact]))
  );
  const phraseProfile = buildResolverInputProfile(character);
  const roundRecoverable = mode === 'round' && (
    info.timeoutFallback
    || source.includes('fast-fallback')
    || (
      fetchOptions.roundQualityPass === true
      && (
        (source === 'local-index' && (genericSingleToken || hasAliasHint))
        || (info.imageSynthetic && lowConfidence)
      )
    )
  );
  if (mode === 'round' && !roundRecoverable) return info;
  const lowFidelity = Boolean(
    roundRecoverable
    || info.timeoutFallback
    || source.includes('fast-fallback')
    || (source === 'local-index' && genericSingleToken)
    || (mode === 'final' && source === 'local-index' && hasAliasHint)
    || (mode === 'final' && hasAliasHint && titleCompact && inputCompact && titleCompact !== inputCompact)
    || (info.imageSynthetic && lowConfidence)
  );
  if (!lowFidelity) return info;

  const aliasUpgraded = await withTimeout(
    tryAliasResolutionOverride(character, info, {
      ...fetchOptions,
      fastRoundMode: false,
      fastAliasOverride: true,
      aliasOverrideBudgetMs: Math.min(650, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS)
    }),
    FINAL_IDENTITY_UPGRADE_TIMEOUT_MS
  );
  let upgraded = aliasUpgraded;
  if (aliasUpgraded && aliasUpgraded !== info) {
    const aliasSource = String(aliasUpgraded.source || '').toLowerCase();
    const aliasCorpus = `${String(aliasUpgraded.title || '')} ${String(aliasUpgraded.description || '')}`.toLowerCase();
    const strongAliasForPhrase =
      (phraseProfile.likelyTechObject && /cathode|crt|liquid[- ]?crystal|display|monitor|television|screen|computer/.test(aliasCorpus))
      || (phraseProfile.compact === 'bmo' && /adventure time|bmo/.test(aliasCorpus))
      || (phraseProfile.compact === 'ashitaka' && /ashitaka|princess mononoke/.test(aliasCorpus))
      || (phraseProfile.compact === 'thegoat' && /\bgoat\b|greatest of all time/.test(aliasCorpus))
      || (phraseProfile.compact === 'themyscira' && /\bthemyscira\b|wonder woman/.test(aliasCorpus))
      || (phraseProfile.compact === 'wakko' && /\bwakko\b|animaniacs/.test(aliasCorpus))
      || (phraseProfile.likelyQuote && aliasSource.includes('wikipedia') && (Number(aliasUpgraded.confidence) || 0) >= 0.75);
    if (strongAliasForPhrase) return aliasUpgraded;
  }
  if (!upgraded || upgraded === info) {
    if (mode === 'round') return info;
    upgraded = await withTimeout(
      tryGenericIdentityUpgrade(character, info, {
        ...fetchOptions,
        identityUpgradeBudgetMs: Math.min(850, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS)
      }),
      Math.min(900, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS + 100)
    );
  }
  if (!upgraded || upgraded === info) return info;

  const upgradedConfidence = Number(upgraded.confidence) || 0;
  const currentConfidence = Number(info.confidence) || 0;
  const upgradedTitle = String(upgraded.title || '').trim();
  const currentTitle = String(info.title || '').trim();
  const improvedSpecificity = canonicalizeName(upgradedTitle) !== canonicalizeName(currentTitle);
  const improvedImage = Boolean(upgraded.imageUrl) && !info.imageUrl;

  if (upgradedConfidence > currentConfidence + 0.04 || improvedSpecificity || improvedImage) {
    return upgraded;
  }

  return info;
}

function candidateLooksLikeDisambiguation(candidate) {
  const title = String(candidate && candidate.title || '');
  const desc = String(candidate && candidate.description || '');
  return /disambiguation|may refer to|list of/i.test(`${title} ${desc}`);
}

function normalizeResolverPhrase(value) {
  return String(value || '')
    .replace(/[“”"']/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\./g, ' ')
    .replace(/[:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeResolverPhrase(value) {
  const raw = normalizeResolverPhrase(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!raw) return [];
  const base = raw.split(/\s+/).filter(Boolean);
  const expanded = [];
  for (const token of base) {
    const compact = canonicalizeName(token);
    if (compact && RESOLVER_ABBREV_EXPANSIONS[compact]) {
      expanded.push(...String(RESOLVER_ABBREV_EXPANSIONS[compact]).split(/\s+/).filter(Boolean));
    } else {
      expanded.push(token);
    }
  }
  return expanded;
}

function buildResolverInputProfile(character) {
  const input = String(character || '').trim();
  const lower = input.toLowerCase();
  const tokens = tokenizeResolverPhrase(input);
  const tokenSet = new Set(tokens);
  const compact = canonicalizeName(input);
  const objectTokenCount = tokens.filter((t) => RESOLVER_OBJECT_TERMS.has(t)).length;
  const foodTokenCount = tokens.filter((t) => RESOLVER_FOOD_TERMS.has(t)).length;
  const placeTokenCount = tokens.filter((t) => RESOLVER_PLACE_TERMS.has(t)).length;
  const hasQuoteMarks = /["“”]/.test(input);
  const startsWithThe = /^\s*the\s+/i.test(input);
  const hasMtAbbrev = /\bmt\.?\b/i.test(input);
  const looksLikeAcronym = tokens.some((t) => /^[a-z]{1,4}\d?$/.test(t) && RESOLVER_ABBREV_EXPANSIONS[canonicalizeName(t)]);
  const allCapsLike = /[A-Z]{2,}/.test(input);
  const likelyQuote = hasQuoteMarks || /…/.test(input) || /\b(i am inevitable|winter is coming|hakuna matata|say my name|hello there|bazinga)\b/i.test(lower);
  const likelyFood = foodTokenCount >= 1 && !/\bking|queen|captain\b/i.test(lower);
  const likelyPlaceLandmark = hasMtAbbrev || /\bmount\b/i.test(lower) || placeTokenCount >= 2;
  const likelyTechObject = objectTokenCount >= 1 || looksLikeAcronym || allCapsLike;
  const likelyMoniker = startsWithThe || /^mr\.?\s/i.test(input) || /^dr\.?\s/i.test(input) || /^col\.?\s/i.test(input);
  const likelyFranchiseObject = objectTokenCount >= 1 && tokens.length >= 2 && !likelyFood && !likelyPlaceLandmark;
  const hasDigit = /\d/.test(input);
  const hasSymbolNoise = /[_~@#$%^*+=|<>]/.test(input);
  const alphaOnlyCompact = /^[a-z]+$/.test(compact);
  const vowelPoor = alphaOnlyCompact && compact.length >= 4 && !/[aeiouy]/.test(compact);

  return {
    input,
    compact,
    tokens,
    tokenSet,
    startsWithThe,
    likelyQuote,
    likelyFood,
    likelyPlaceLandmark,
    likelyTechObject,
    likelyMoniker,
    likelyFranchiseObject,
    looksLikeAcronym,
    allCapsLike,
    hasQuoteMarks,
    hasDigit,
    hasSymbolNoise,
    alphaOnlyCompact,
    vowelPoor,
    objectTokenCount,
    foodTokenCount,
    placeTokenCount,
    hasMtAbbrev
  };
}

function getGenericUpgradeHintSets(character) {
  const profile = buildResolverInputProfile(character);
  const contextHints = [];
  const entityHints = [];

  if (profile.likelyFood) {
    contextHints.push('food', 'dish', 'snack');
    entityHints.push('food', 'dish', 'beverage');
  }
  if (profile.likelyPlaceLandmark) {
    contextHints.push('place', 'mountain', 'landmark');
    entityHints.push('place', 'mountain', 'landmark');
  }
  if (profile.likelyTechObject) {
    contextHints.push('technology', 'device');
    entityHints.push('object', 'technology');
  }
  if (profile.likelyQuote) {
    contextHints.push('quote', 'phrase');
    entityHints.push('character', 'person', 'franchise');
  }
  if (profile.likelyMoniker && !profile.likelyFood && !profile.likelyPlaceLandmark) {
    entityHints.push('character', 'person');
  }
  if (profile.likelyFranchiseObject) {
    contextHints.push('franchise', 'fictional');
    entityHints.push('object', 'fictional character');
  }

  return {
    contextHints: Array.from(new Set(contextHints)).slice(0, 4),
    entityHints: Array.from(new Set(entityHints)).slice(0, 4)
  };
}

function buildCategoryFetchHints(categoryContext = null) {
  const ctx = categoryContext && typeof categoryContext === 'object' ? categoryContext : {};
  const id = String(ctx.id || '').toLowerCase();
  const family = String(ctx.family || '').toLowerCase();
  const label = String(ctx.name || ctx.displayName || '').toLowerCase();
  const text = `${id} ${family} ${label}`.trim();
  if (!text) return { contextHints: [], entityHints: [] };

  const contextHints = [];
  const entityHints = [];
  const genericHintStop = new Set(['with', 'from', 'into', 'over', 'under', 'mode', 'category', 'categories', 'group']);
  const push = (target, values = []) => {
    values.forEach((value) => {
      const token = String(value || '').trim().toLowerCase();
      if (!token || token.length < 3) return;
      target.push(token);
    });
  };

  if (id.includes('detective') || id.includes('investigator') || label.includes('detective')) {
    push(contextHints, ['investigation', 'crime', 'mystery', 'forensics']);
    push(entityHints, ['detective', 'investigator', 'fictional character', 'person']);
  }
  if (id.includes('aircraft') || id.includes('pilot') || id.includes('aviator')) {
    push(contextHints, ['aviation', 'flight', 'aircraft', 'aerospace']);
    push(entityHints, ['aircraft', 'pilot', 'vehicle']);
  }
  if (id.includes('spacecraft') || id.includes('aerospace')) {
    push(contextHints, ['spaceflight', 'orbital', 'launch vehicle', 'mission']);
    push(entityHints, ['spacecraft', 'vehicle', 'system']);
  }
  if (id.includes('robot') || id.includes('ai') || id.includes('comput') || id.includes('cyber')) {
    push(contextHints, ['technology', 'computing', 'automation', 'engineering']);
    push(entityHints, ['technology', 'device', 'system']);
  }
  if (id.includes('medical') || id.includes('biotech') || id.includes('genetic')) {
    push(contextHints, ['medicine', 'clinical', 'healthcare', 'biomedical']);
    push(entityHints, ['person', 'medical', 'equipment', 'technology']);
  }
  if (id.includes('sport') || id.includes('athlete') || id.includes('martial') || id.includes('combat')) {
    push(contextHints, ['sports', 'competition', 'training', 'championship', 'combat sports', 'boxing', 'mma', 'ufc']);
    push(entityHints, ['athlete', 'person', 'team', 'fighter', 'boxer', 'commentator', 'promoter']);
  }
  if (id.includes('marvel') || id.includes('dc') || label.includes('marvel') || /\bdc\b/.test(label)) {
    push(contextHints, ['marvel', 'dc comics', 'superhero', 'comic book', 'justice league', 'teen titans']);
    push(entityHints, ['superhero', 'comic book character', 'dc comics', 'marvel comics', 'fictional character']);
  }
  if (id.includes('scifi') || id.includes('sci-fi') || label.includes('sci-fi') || label.includes('science fiction')) {
    push(contextHints, ['science fiction', 'sci-fi', 'space opera', 'galactic', 'starship', 'alien worlds']);
    push(entityHints, ['science fiction franchise', 'space opera', 'fictional universe', 'franchise']);
  }
  if (id.includes('leader') || label.includes('leader') || label.includes('president') || label.includes('prime minister')) {
    push(contextHints, ['politics', 'government', 'head of state', 'president', 'prime minister', 'statecraft']);
    push(entityHints, ['person', 'politician', 'world leader', 'head of state', 'monarch']);
  }
  if (id.includes('magic') || id.includes('wizard') || id.includes('sorcer') || label.includes('magic') || label.includes('wizard') || label.includes('sorcer')) {
    push(contextHints, ['magic', 'arcane', 'mystic', 'spellcaster', 'sorcery']);
    push(entityHints, ['fictional character', 'wizard', 'sorcerer', 'witch', 'mage']);
  }
  if (id.includes('diplomacy') || id.includes('treaty') || id.includes('negotiation') || label.includes('diplomacy') || label.includes('treaty')) {
    push(contextHints, ['diplomacy', 'treaty', 'statecraft', 'foreign policy', 'peace talks']);
    push(entityHints, ['person', 'leader', 'diplomat', 'historical figure']);
  }
  if (id.includes('actor') || id.includes('entertainer') || id.includes('musician') || label.includes('entertainer')) {
    push(contextHints, ['actor', 'performer', 'film', 'television', 'entertainment']);
    push(entityHints, ['person', 'actor', 'entertainer']);
  }
  if (id.includes('chef') || id.includes('culinary') || id.includes('cuisine')) {
    push(contextHints, ['food', 'dish', 'culinary', 'restaurant']);
    push(entityHints, ['food', 'dish', 'person']);
  }
  if (id.includes('city') || id.includes('environment') || id.includes('site')) {
    push(contextHints, ['location', 'geography', 'landmark', 'environment']);
    push(entityHints, ['place', 'landmark', 'region']);
  }
  if (id.includes('deities') || id.includes('mythic')) {
    push(contextHints, ['mythology', 'legend', 'folklore', 'pantheon']);
    push(entityHints, ['mythological figure', 'creature', 'deity']);
  }
  if (id.includes('superhero') || id.includes('villain') || id.includes('anime') || id.includes('franchise')) {
    push(contextHints, ['fictional', 'franchise', 'character', 'canon']);
    push(entityHints, ['fictional character', 'character', 'franchise']);
  }
  if (family.includes('vehicles')) {
    push(contextHints, ['transport', 'vehicle', 'navigation']);
    push(entityHints, ['vehicle', 'transport']);
  } else if (family.includes('science')) {
    push(contextHints, ['science', 'research', 'engineering']);
    push(entityHints, ['technology', 'system', 'person']);
  } else if (family.includes('history')) {
    push(contextHints, ['history', 'politics', 'historical']);
    push(entityHints, ['person', 'event', 'place']);
  } else if (family.includes('media') || family.includes('fiction')) {
    push(contextHints, ['media', 'fictional', 'franchise']);
    push(entityHints, ['character', 'fictional character', 'person']);
  }

  const genericTokens = text
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !genericHintStop.has(token));
  push(contextHints, genericTokens.slice(0, 4));
  push(entityHints, genericTokens.slice(0, 3));

  return {
    contextHints: Array.from(new Set(contextHints)).slice(0, 6),
    entityHints: Array.from(new Set(entityHints)).slice(0, 6)
  };
}

function scoreGenericIdentityUpgradeCandidate(character, candidate, currentInfo) {
  if (!candidate || !candidate.title || candidateLooksLikeDisambiguation(candidate)) return -999;
  const input = String(character || '');
  const profile = buildResolverInputProfile(input);
  const inputCompact = canonicalizeName(input);
  const title = String(candidate.title || '');
  const titleCompact = canonicalizeName(title);
  const desc = String(candidate.description || '').toLowerCase();
  const currentTitleCompact = canonicalizeName(currentInfo && currentInfo.title);
  const overlap = tokenOverlapScoreLoose(input, title);
  const singleTokenInput = inputCompact && !String(inputCompact).includes(' ');
  const titleTokens = new Set(tokenizeResolverPhrase(title));
  const descTokens = new Set(tokenizeResolverPhrase(desc));
  const hasAllMainTokens = profile.tokens.filter((t) => t.length >= 3).every((t) => titleTokens.has(t) || descTokens.has(t));
  const anyObjectTokenInCandidate = Array.from(profile.tokenSet).some((t) => RESOLVER_OBJECT_TERMS.has(t) && (titleTokens.has(t) || descTokens.has(t)));
  const anyFoodTokenInCandidate = Array.from(profile.tokenSet).some((t) => RESOLVER_FOOD_TERMS.has(t) && (titleTokens.has(t) || descTokens.has(t)));
  const candidateLooksPerson = /person|actor|athlete|singer|rapper|politician|wrestler|philosopher|scientist|historian|composer|author|businessman/.test(desc);
  const candidateLooksFood = /food|dish|snack|dessert|drink|beverage|restaurant|fast[- ]?food|cuisine|recipe|ingredient|sauce/.test(desc);
  const candidateLooksPlace = /mountain|volcano|city|country|river|sea|ocean|desert|island|landmark|monument|region|mythological place|fictional city/.test(desc);
  const candidateLooksTech = /device|computer|display|monitor|television|electronics|technology|screen|hardware|software|video game console/.test(desc);
  const candidateLooksTechByTitle = /\bcrt\b|cathode[- ]?ray|liquid[- ]?crystal|display|monitor|television|screen|computer|hardware|software/.test(String(candidate.title || '').toLowerCase());
  const candidateLooksQuote = /phrase|quote|catchphrase|slogan|line|motto/.test(desc);
  const candidateLooksFranchise = /franchise|series|film series|media franchise/.test(desc);
  let score = 0;

  score += overlap * 100;
  if (titleCompact === inputCompact) score += 40;
  if (singleTokenInput && titleCompact && titleCompact.includes(inputCompact)) score += 18;
  if (hasAllMainTokens) score += 18;
  if (profile.likelyFranchiseObject && anyObjectTokenInCandidate) score += 10;
  if (profile.likelyFood && anyFoodTokenInCandidate) score += 12;
  if (candidate.imageUrl) score += 16;
  if ((String(candidate.source || '').toLowerCase()).includes('wikipedia')) score += 8;
  if (/fictional character|superhero|video game character|anime character|manga character/.test(desc)) score += 10;
  if (/person|historian|scientist|composer|philosopher|athlete|actor|singer|politician/.test(desc)) score += 8;
  if (/film|movie/.test(desc)) score -= 8;
  if (/franchise|media franchise/.test(desc)) score -= 6;
  if (singleTokenInput && new RegExp(`^${String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'s\\b`, 'i').test(title)) score -= 24;
  if (titleCompact === currentTitleCompact) score -= 2;

  if (profile.likelyFood) {
    if (candidateLooksFood) score += 18;
    if (candidateLooksPerson && !anyFoodTokenInCandidate) score -= 28;
    if (/criminal|wrestler|politician|philosopher|song|album/.test(desc)) score -= 20;
    if (!candidateLooksFood && overlap < 0.5 && !anyFoodTokenInCandidate) score -= 16;
  }
  if (profile.likelyPlaceLandmark) {
    if (candidateLooksPlace || /\bmount\b|\bmt\b/.test(String(candidate.title || '').toLowerCase())) score += 16;
    if (candidateLooksPerson && !/saint|pope|king|queen/.test(desc)) score -= 26;
    if (!candidateLooksPlace && overlap < 0.5 && !/city|mount|peak|camp|summit/.test(String(candidate.title || '').toLowerCase())) score -= 18;
  }
  if (profile.likelyTechObject) {
    if (candidateLooksTech) score += 14;
    if (candidateLooksTechByTitle) score += 12;
    if (candidateLooksPerson && !/inventor|engineer/.test(desc)) score -= 16;
    if (!candidateLooksTech && !candidateLooksTechByTitle && !candidateLooksFranchise && overlap < 0.5) score -= 14;
    if (profile.looksLikeAcronym && !candidateLooksTech && !candidateLooksTechByTitle) score -= 10;
    if (/critical race theory|album|song|rapper|singer|wrestler|actor/.test(desc) && !candidateLooksTechByTitle) score -= 20;
  }
  if (profile.likelyQuote) {
    if (candidateLooksQuote) score += 14;
    if (!hasAllMainTokens && overlap < 0.5 && !candidateLooksFranchise) score -= 14;
  }
  if (profile.likelyMoniker && profile.startsWithThe && overlap < 0.34 && !candidateLooksFranchise) score -= 10;
  if (profile.likelyMoniker && profile.startsWithThe && candidateLooksPerson) score += 6;
  if (profile.compact === 'thegoat') {
    if (!/\bgoat\b|greatest of all time/i.test(`${title} ${candidate.description || ''}`)) score -= 40;
    if (/\bgoat\b/i.test(title)) score += 24;
  }
  if (profile.compact === 'bmo') {
    if (/bank of montreal|islands \(miniseries\)/i.test(`${title} ${candidate.description || ''}`)) score -= 60;
    if (/adventure time|bmo/i.test(`${title} ${candidate.description || ''}`)) score += 22;
  }
  if (profile.compact === 'ashitaka') {
    if (/mount ashitaka/i.test(title)) score -= 70;
    if (/princess mononoke|ashitaka/i.test(`${title} ${candidate.description || ''}`)) score += 20;
  }
  if (profile.compact && RESOLVER_QUOTE_ALIAS_OVERRIDES[profile.compact]) {
    const allowed = RESOLVER_QUOTE_ALIAS_OVERRIDES[profile.compact].map((v) => canonicalizeName(v));
    if (allowed.some((v) => v && (titleCompact.includes(v) || desc.includes(v.replace(/[^a-z0-9]/g, ' '))))) score += 28;
  }
  if (profile.compact && RESOLVER_MONIKER_OVERRIDES[profile.compact]) {
    const allowed = RESOLVER_MONIKER_OVERRIDES[profile.compact].map((v) => canonicalizeName(v));
    if (allowed.some((v) => v && (titleCompact.includes(v) || desc.includes(v.replace(/[^a-z0-9]/g, ' '))))) score += 22;
  }
  return score;
}

function estimateDangerousTitleDiffRisk(character, info) {
  if (!info || typeof info !== 'object') return 0;
  const title = String(info.title || '').trim();
  if (!title) return 0;

  const inputCompact = canonicalizeName(character);
  const titleCompact = canonicalizeName(title);
  if (!inputCompact || !titleCompact || inputCompact === titleCompact) return 0;
  const inputCompactNoParens = canonicalizeName(String(character || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  const leetNormalizedInput = canonicalizeName(String(character || '')
    .replace(/[0]/g, 'o')
    .replace(/[1]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't'));

  const source = String(info.source || '').toLowerCase();
  if (!source.includes('wiki')) return 0;
  if (info.timeoutFallback || source.includes('fast-fallback')) return 0;

  const titleCompactNoParens = canonicalizeName(String(title).replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  const infoAliases = Array.isArray(info.aliases) ? info.aliases : [];
  const normalizedLower = normalizeName(character).toLowerCase();
  const typoFixed = resolveLikelyTypo(character);
  const typoCompact = canonicalizeName(typoFixed || '');
  const aliasTargets = []
    .concat(CHARACTER_NAME_ALIASES[normalizedLower] || [])
    .concat(CHARACTER_NAME_ALIASES[inputCompact] || [])
    .concat(RESOLVER_MONIKER_OVERRIDES[inputCompact] || [])
    .concat(RESOLVER_QUOTE_ALIAS_OVERRIDES[inputCompact] || [])
    .map((value) => normalizeName(value))
    .filter(Boolean);
  const aliasTargetCompacts = new Set(aliasTargets.map((value) => canonicalizeName(value)).filter(Boolean));
  const infoAliasCompacts = new Set(infoAliases.map((value) => canonicalizeName(value)).filter(Boolean));
  if (titleCompactNoParens && (titleCompactNoParens === inputCompact || (inputCompactNoParens && titleCompactNoParens === inputCompactNoParens))) return 0;
  if (leetNormalizedInput && (leetNormalizedInput === titleCompact || leetNormalizedInput === titleCompactNoParens)) return 0;
  if (inputCompactNoParens && (titleCompact === inputCompactNoParens || titleCompactNoParens === inputCompactNoParens)) return 0;
  if (typoCompact && (typoCompact === titleCompact || typoCompact === titleCompactNoParens || infoAliasCompacts.has(typoCompact))) return 0;
  if (aliasTargetCompacts.has(titleCompact) || (titleCompactNoParens && aliasTargetCompacts.has(titleCompactNoParens))) return 0;
  for (const aliasCompact of aliasTargetCompacts) {
    if (!aliasCompact) continue;
    if (infoAliasCompacts.has(aliasCompact)) return 0;
    if (aliasCompact === inputCompact) continue;
    if (titleCompact.includes(aliasCompact) || aliasCompact.includes(titleCompact)) return 0;
  }

  const normalizePersonTokens = (value) => String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const personTokenDistance = (a = '', b = '') => {
    const s = String(a || '');
    const t = String(b || '');
    if (!s || !t) return 99;
    const dp = Array.from({ length: s.length + 1 }, () => Array(t.length + 1).fill(0));
    for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= s.length; i += 1) {
      for (let j = 1; j <= t.length; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[s.length][t.length];
  };
  const nicknamePairs = {
    bob: ['robert', 'bobby', 'rob'],
    rob: ['robert', 'bob'],
    bill: ['william', 'will', 'billy'],
    will: ['william', 'bill'],
    jim: ['james', 'jimmy'],
    jimmy: ['james', 'jim'],
    joe: ['joseph', 'joey'],
    mike: ['michael', 'mikey'],
    meg: ['megan', 'meghan'],
    megan: ['meghan', 'meg'],
    meghan: ['megan', 'meg']
  };
  const areNameVariantTokens = (a = '', b = '') => {
    const left = String(a || '').toLowerCase();
    const right = String(b || '').toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    if ((nicknamePairs[left] || []).includes(right)) return true;
    if ((nicknamePairs[right] || []).includes(left)) return true;
    if (left.length >= 4 && right.length >= 4 && personTokenDistance(left, right) <= 2) return true;
    return false;
  };
  const inputPersonTokens = normalizePersonTokens(character);
  const titlePersonTokens = normalizePersonTokens(title);
  if (inputPersonTokens.length >= 2 && titlePersonTokens.length >= 2) {
    const inputFirst = inputPersonTokens[0];
    const inputLast = inputPersonTokens[inputPersonTokens.length - 1];
    const titleFirst = titlePersonTokens[0];
    const titleLast = titlePersonTokens[titlePersonTokens.length - 1];
    if (areNameVariantTokens(inputLast, titleLast) && areNameVariantTokens(inputFirst, titleFirst)) {
      return 0;
    }
  }
  const typoOverlap = tokenOverlapScoreLoose(resolveLikelyTypo(character) || '', title);
  if (Number.isFinite(typoOverlap) && typoOverlap >= 0.67) return 2;
  if (inputPersonTokens.length >= 2 && titlePersonTokens.length === 1) {
    const single = titlePersonTokens[0];
    if (inputPersonTokens.some((token) => token === single || personTokenDistance(token, single) <= 2)) {
      return 2;
    }
  }

  const profile = buildResolverInputProfile(character);
  const hasAliasHint = hasAliasHintForCompact(profile.compact);
  const singleTokenInput = (profile.tokens || []).length <= 1;
  const noisySingleTokenInput = singleTokenInput && (
    profile.hasDigit
    || profile.hasSymbolNoise
    || profile.vowelPoor
    || String(profile.compact || '').length >= 20
  );
  if (noisySingleTokenInput && !hasAliasHint) return 2;
  if (profile.hasDigit && profile.hasSymbolNoise && !hasAliasHint) return 3;
  const inputTokens = (Array.isArray(profile.tokens) ? profile.tokens : []).filter((t) => String(t || '').length >= 3);
  if (!inputTokens.length) return 0;

  const titleTokens = new Set(tokenizeResolverPhrase(title));
  const descTokens = new Set(tokenizeResolverPhrase(String(info.description || '')));
  const overlap = tokenOverlapScoreLoose(character, title);
  const matchCount = inputTokens.filter((t) => titleTokens.has(t) || descTokens.has(t)).length;
  const personLike = /person|actor|athlete|singer|rapper|politician|wrestler|philosopher|scientist|historian|composer|author|businessman/.test(String(info.description || '').toLowerCase());

  let risk = 0;
  if (matchCount === 0) risk += 6;
  if (matchCount > 0 && matchCount < inputTokens.length) risk += 3;
  if (inputTokens.length >= 2 && matchCount <= 1) risk += 2;
  if (overlap < 0.34) risk += 5;
  else if (overlap < 0.5) risk += 3;
  if (source.includes('wikipedia-search')) risk += 2;
  if (personLike && inputTokens.length >= 2 && matchCount <= 1) risk += 2;
  if (Number(info.confidence) >= 0.7 && inputTokens.length >= 2 && matchCount <= 1) risk += 1; // overconfident mismatch suspicion

  if (source.includes('wikipedia-search') && singleTokenInput && !hasAliasHint) {
    risk = Math.min(risk, 5);
  }

  return risk;
}

function shouldAttemptDangerousTitleDiffRescue(character, info, fetchOptions = {}) {
  if (!info || typeof info !== 'object') return false;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode !== 'final') return false;
  const source = String(info.source || '').toLowerCase();
  if (!source.includes('wiki')) return false;
  if (!String(info.title || '').trim()) return false;
  if (canonicalizeName(info.title) === canonicalizeName(character)) return false;
  if (info.timeoutFallback || source.includes('fast-fallback')) return false;
  if (Number(info.confidence) > 0 && Number(info.confidence) < 0.4) return false;
  return estimateDangerousTitleDiffRisk(character, info) >= 6;
}

async function tryRescueDangerousTitleDiffIdentity(character, info, fetchOptions = {}) {
  if (!shouldAttemptDangerousTitleDiffRescue(character, info, fetchOptions)) return info;

  const currentRisk = estimateDangerousTitleDiffRisk(character, info);
  let candidate = info;

  const aliasAttempt = await withTimeout(
    tryAliasResolutionOverride(character, info, {
      ...fetchOptions,
      fastRoundMode: false,
      fastAliasOverride: true,
      aliasOverrideBudgetMs: Math.min(500, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS)
    }),
    Math.min(550, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS + 50)
  );
  if (aliasAttempt && aliasAttempt !== info) {
    const aliasRisk = estimateDangerousTitleDiffRisk(character, aliasAttempt);
    if (aliasRisk + 1 < currentRisk || canonicalizeName(aliasAttempt.title) === canonicalizeName(character)) {
      candidate = {
        ...aliasAttempt,
        dangerousTitleDiffRescued: true,
        dangerousTitleDiffRiskBefore: currentRisk,
        dangerousTitleDiffRiskAfter: aliasRisk
      };
    }
  }

  const upgraded = await withTimeout(
    tryGenericIdentityUpgrade(character, candidate, {
      ...fetchOptions,
      identityUpgradeBudgetMs: Math.min(700, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS)
    }),
    Math.min(760, FINAL_IDENTITY_UPGRADE_TIMEOUT_MS + 120)
  );

  if (!upgraded || upgraded === candidate) return candidate;

  const upgradedRisk = estimateDangerousTitleDiffRisk(character, upgraded);
  const currentConfidence = Number(candidate.confidence) || 0;
  const upgradedConfidence = Number(upgraded.confidence) || 0;
  const exactNow = canonicalizeName(upgraded.title) === canonicalizeName(character);
  const improvedImage = Boolean(upgraded.imageUrl) && !candidate.imageUrl;

  const markRescue = (value) => ({
    ...value,
    dangerousTitleDiffRescued: true,
    dangerousTitleDiffRiskBefore: currentRisk,
    dangerousTitleDiffRiskAfter: upgradedRisk
  });

  if (exactNow) return markRescue(upgraded);
  if (upgradedRisk + 1 < estimateDangerousTitleDiffRisk(character, candidate)) return markRescue(upgraded);
  if (improvedImage && upgradedConfidence >= currentConfidence) return markRescue(upgraded);
  if (upgradedConfidence >= currentConfidence + 0.08 && upgradedRisk <= currentRisk) return markRescue(upgraded);

  return candidate;
}

function tokenOverlapScoreLoose(a, b) {
  const normalize = (v) => String(v || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const aTokens = new Set(normalize(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalize(b).split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  return overlap / Math.max(1, Math.min(aTokens.size, bTokens.size));
}

function buildGenericIdentityUpgradeQueries(character, info) {
  const normalize = (v) => normalizeName(v);
  const raw = String(character || '').trim();
  const title = String(info && info.title || '').trim();
  const phraseProfile = buildResolverInputProfile(raw);
  const words = normalizeResolverPhrase(raw).split(/\s+/).filter(Boolean);
  const lowerWords = words.map((w) => w.toLowerCase());

  const foodHeads = new Set([
    'pizza', 'sushi', 'ramen', 'burger', 'hamburger', 'cheeseburger', 'taco', 'tacos', 'burrito',
    'nachos', 'fajitas', 'noodles', 'macaroni', 'lasagna', 'pasta', 'spaghetti', 'risotto',
    'dumplings', 'dimsum', 'samosa', 'falafel', 'kimchi', 'waffles', 'pancakes', 'donut', 'bagel',
    'pretzel', 'cupcake', 'brownie', 'cookie', 'cheesecake', 'gelato', 'milkshake', 'smoothie',
    'lemonade', 'espresso', 'latte', 'cappuccino', 'frappe', 'tea', 'coffee', 'chocolate',
    'icecream', 'salad', 'pot', 'sauce', 'rice', 'cake'
  ]);

  const queries = [];
  const push = (value) => {
    const n = normalize(value);
    if (n) queries.push(n);
  };

  if (phraseProfile.compact && RESOLVER_QUOTE_ALIAS_OVERRIDES[phraseProfile.compact]) {
    RESOLVER_QUOTE_ALIAS_OVERRIDES[phraseProfile.compact].forEach(push);
  }
  if (phraseProfile.compact && RESOLVER_MONIKER_OVERRIDES[phraseProfile.compact]) {
    RESOLVER_MONIKER_OVERRIDES[phraseProfile.compact].forEach(push);
  }

  if (phraseProfile.hasMtAbbrev) {
    push(raw.replace(/\bMt\.?\b/gi, 'Mount'));
  }
  if (/\bDr\.?\b/i.test(raw)) push(raw.replace(/\bDr\.?\b/gi, 'Doctor'));
  if (/\bMr\.?\b/i.test(raw)) push(raw.replace(/\bMr\.?\b/gi, 'Mister'));
  if (/\bCol\.?\b/i.test(raw)) push(raw.replace(/\bCol\.?\b/gi, 'Colonel'));

  // Acronym / shorthand expansions (broad)
  if (words.length) {
    const expandedWords = words.flatMap((w) => {
      const compact = canonicalizeName(w);
      const expansion = RESOLVER_ABBREV_EXPANSIONS[compact];
      return expansion ? String(expansion).split(/\s+/) : [w];
    });
    if (expandedWords.join(' ').toLowerCase() !== words.join(' ').toLowerCase()) {
      push(expandedWords.join(' '));
    }
  }

  push(raw);
  push(title);
  push(info && info.lookupMeta && info.lookupMeta.resolution && info.lookupMeta.resolution.canonical);

  if (words.length >= 2) {
    push(words.slice(0, 2).join(' '));
    push(words.slice(-2).join(' '));
    push(words[0]);
    push(words[words.length - 1]);
  }

  if (words.length === 2) {
    push(`${words[1]} ${words[0]}`); // e.g., "Milkshake Strawberry" -> "Strawberry Milkshake"
  }

  const compactWords = lowerWords.map((w) => canonicalizeName(w));
  const hasFoodHead = compactWords.some((w) => foodHeads.has(w));
  if (hasFoodHead && words.length >= 2) {
    const headIndex = compactWords.findIndex((w) => foodHeads.has(w));
    if (headIndex > 0) {
      const reordered = [words[headIndex], ...words.slice(0, headIndex), ...words.slice(headIndex + 1)];
      push(reordered.join(' '));
    }
    if (words.length >= 3) {
      push(words.filter((w) => !/^(the|a|an)$/i.test(w)).join(' '));
    }
    // common style pattern
    if (compactWords.includes('cheesecake') && lowerWords.includes('new') && lowerWords.includes('york')) {
      push('New York-style cheesecake');
      push('New York cheesecake');
    }
    if (compactWords.includes('icecream') && lowerWords.includes('sandwich')) push('Ice cream sandwich');
    if (compactWords.includes('icecream') && lowerWords.includes('cake')) push('Ice cream cake');
    if (compactWords.includes('sushi') && lowerWords.includes('roll')) push('Sushi roll');
    if (compactWords.includes('cheetos') && lowerWords.includes('hot')) {
      push("Flamin' Hot Cheetos");
      push('Cheetos');
    }
    if (compactWords.includes('kfc')) push('KFC');
    if (compactWords.includes('bbq') && compactWords.includes('ribs')) push('Barbecue ribs');
  }

  if (phraseProfile.likelyPlaceLandmark) {
    if (/\bbase\b/i.test(raw) && /\beverest\b/i.test(raw)) {
      push('Everest Base Camp');
      push('Mount Everest base camp');
    }
    if (/\bcamp\b/i.test(raw) && /\beverest\b/i.test(raw)) {
      push('Everest Base Camp');
    }
    if (/\bhood\b/i.test(raw) && /\bor\b/i.test(raw)) {
      push('Mount Hood');
    }
    if (/\bfuji\b/i.test(raw) && /\bpeak\b/i.test(raw)) push('Mount Fuji');
    if (/\bolympus\b/i.test(raw) && /\bgreece|myth\b/i.test(raw)) {
      push(/\bgreece\b/i.test(raw) ? 'Mount Olympus' : 'Mount Olympus (mythology)');
    }
  }

  if (phraseProfile.likelyFranchiseObject) {
    const objectTerms = words.filter((w) => RESOLVER_OBJECT_TERMS.has(canonicalizeName(w)));
    const subjectTerms = words.filter((w) => !RESOLVER_OBJECT_TERMS.has(canonicalizeName(w)));
    if (subjectTerms.length && objectTerms.length) {
      push(`${subjectTerms.join(' ')} ${objectTerms.join(' ')}`);
      push(`${subjectTerms.join(' ')} (${objectTerms.join(' ')})`);
      push(subjectTerms.join(' '));
    }
    if (/batmobile tumbler/i.test(raw)) {
      push('Tumbler (Batman)');
      push('Batmobile');
    }
    if (/iron throne/i.test(raw)) {
      push('Iron Throne');
      push('Game of Thrones');
    }
    if (/poseidon('?s)? trident/i.test(raw) || /aquaman trident/i.test(raw)) {
      push("Poseidon's trident");
      push('Trident of Poseidon');
      push('Aquaman');
    }
  }

  if (phraseProfile.likelyQuote && words.length >= 2) {
    push(words.join(' '));
    push(words.filter((w) => w.length >= 3).join(' '));
  }

  const out = [];
  const seen = new Set();
  for (const q of queries) {
    const key = canonicalizeName(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out.slice(0, 8);
}

async function tryGenericIdentityUpgrade(character, info, fetchOptions = {}) {
  if (!info || typeof info !== 'object') return info;
  const mode = String((fetchOptions && fetchOptions.mode) || '').toLowerCase();
  if (mode !== 'final') return info;

  const queries = buildGenericIdentityUpgradeQueries(character, info);
  if (!queries.length) return info;
  const neutralHints = getGenericUpgradeHintSets(character);

  const budget = Math.max(600, Math.min(1800, Number(fetchOptions && fetchOptions.identityUpgradeBudgetMs) || (FINAL_IDENTITY_UPGRADE_TIMEOUT_MS + 350)));
  const deadlineAt = Date.now() + budget;
  let bestCandidate = null;
  let bestScore = -999;
  const exactTimeout = Math.min(900, budget);
  const searchTimeout = Math.min(1000, budget);
  const summaryTimeout = Math.min(900, budget);

  for (const query of queries) {
    if (Date.now() >= deadlineAt) break;

    const exact = await withTimeout(fetchFromWikipediaEnhanced(query), exactTimeout);
    if (exact) {
      const s = scoreGenericIdentityUpgradeCandidate(character, exact, info);
      if (s > bestScore) { bestCandidate = exact; bestScore = s; }
      if (s >= 125) break;
    }

    if (Date.now() >= deadlineAt) break;
    // Neutral search (no context hints) avoids scenario-biased garbage matches for raw nouns like "Pizza".
    const searched = await withTimeout(
      fetchFromWikipediaSearchEnhanced(query, neutralHints.contextHints, neutralHints.entityHints),
      searchTimeout
    );
    if (searched) {
      const s = scoreGenericIdentityUpgradeCandidate(character, searched, info);
      if (s > bestScore) { bestCandidate = searched; bestScore = s; }
      if (s >= 125) break;
    }

    if (Date.now() >= deadlineAt) break;
    const summary = await withTimeout(fetchFromWikipediaSummary(query), summaryTimeout);
    if (summary) {
      const s = scoreGenericIdentityUpgradeCandidate(character, summary, info);
      if (s > bestScore) { bestCandidate = summary; bestScore = s; }
    }
  }

  if (!bestCandidate || bestScore < 35) return info;
  const currentScore = scoreGenericIdentityUpgradeCandidate(character, info, info);
  if (bestScore < currentScore + 8 && !(bestCandidate.imageUrl && !info.imageUrl)) return info;
  return {
    ...bestCandidate,
    confidence: Math.max(Number(bestCandidate.confidence) || 0.75, 0.75),
    confidenceBand: bestCandidate.confidenceBand || 'high'
  };
}

async function tryEnrichIdentityFromExternalFacts(character, info, fetchOptions = {}) {
  const safeInfo = info && typeof info === 'object' ? info : null;
  if (!safeInfo) return info;
  if (!CONTEXT_EXTERNAL_FACT_ENRICH_ENABLED) return info;
  if (fetchOptions && fetchOptions.skipExternalFactEnrichment === true) return info;
  if (!shouldTryExternalFactEnrichment(character, safeInfo, fetchOptions)) return info;

  const confidence = Number(safeInfo.confidence) || 0;
  const descriptionLen = String(safeInfo.description || '').replace(/\s+/g, ' ').trim().length;
  const source = String(safeInfo.source || '').toLowerCase();
  const isFastRound = Boolean(fetchOptions && fetchOptions.fastRoundMode);

  // Keep round-path latency tight: only enrich if the current result is thin or clearly low-fidelity.
  if (isFastRound && confidence >= 0.55 && descriptionLen >= 70) return info;
  if (isFastRound && /wikipedia/.test(source) && descriptionLen >= 56) return info;

  const meta = {
    character,
    resolvedTitle: String(safeInfo.title || safeInfo.name || character || '').trim(),
    aliases: Array.isArray(safeInfo.aliases) ? safeInfo.aliases.slice(0, 12) : [],
    description: String(safeInfo.description || '').slice(0, 700),
    resolvedSource: safeInfo.source || null,
    infoConfidence: confidence,
    resolverConfidence: confidence,
    imageSynthetic: Boolean(safeInfo.imageSynthetic)
  };

  const timeoutMs = Math.max(
    200,
    Math.min(
      isFastRound ? Math.min(EXTERNAL_FACT_ENRICH_TIMEOUT_MS, 320) : EXTERNAL_FACT_ENRICH_TIMEOUT_MS,
      Number(fetchOptions && fetchOptions.externalFactTimeoutMs) || EXTERNAL_FACT_ENRICH_TIMEOUT_MS
    )
  );

  const lookup = await withTimeout(
    lookupExternalEntityFact(meta, {
      sources: isFastRound ? ['wikidata'] : ['wikidata', 'dbpedia'],
      fastOnly: isFastRound || confidence < MIN_INFO_CONFIDENCE,
      totalTimeoutMs: timeoutMs,
      wikidataTimeoutMs: Math.min(timeoutMs, isFastRound ? 280 : 450),
      dbpediaTimeoutMs: Math.min(Math.max(350, timeoutMs), isFastRound ? 0 : 900),
      stopOnFirstHit: false
    }),
    timeoutMs
  ).catch(() => null);

  const best = lookup && lookup.best ? lookup.best : null;
  if (!best || !best.description) return info;

  const merged = mergeExternalFactIntoInfo(safeInfo, best, character);
  if (!merged || merged === safeInfo) return info;
  return merged;
}

function buildFetchOptions(character, options = {}, scenario, twist) {
  const fetchContext = options && options.fetchContext && typeof options.fetchContext === 'object'
    ? options.fetchContext
    : {};
  const hasOwn = (key) => Boolean(options && Object.prototype.hasOwnProperty.call(options, key));
  const defaultRoundQualityPass = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.CONTEXT_ROUND_QUALITY_PASS || 'false').toLowerCase()
  );
  const roundQualityPass = hasOwn('roundQualityPass')
    ? Boolean(options.roundQualityPass)
    : Boolean(options && options.evaluationMode === 'round' && defaultRoundQualityPass);

  const categoryHintSeed = buildCategoryFetchHints(
    (options && options.categoryContext && typeof options.categoryContext === 'object')
      ? options.categoryContext
      : null
  );
  const mergedContextHints = Array.from(new Set([
    ...(Array.isArray(fetchContext.contextHints) ? fetchContext.contextHints : []),
    ...categoryHintSeed.contextHints
  ])).slice(0, 6);
  const mergedEntityHints = Array.from(new Set([
    ...(Array.isArray(fetchContext.entityHints) ? fetchContext.entityHints : []),
    ...categoryHintSeed.entityHints
  ])).slice(0, 6);

  return {
    character,
    mode: options && options.evaluationMode ? options.evaluationMode : 'context',
    forceRefresh: Boolean(options && options.forceRefresh),
    fetchCacheTtlMs: Number(options && options.fetchCacheTtlMs) || 0,
    contextHints: mergedContextHints,
    entityHints: mergedEntityHints,
    scenario: fetchContext.scenario || scenario,
    twist: fetchContext.twist || twist,
    originalScenario: fetchContext.originalScenario || options.originalScenario || scenario,
    originalTwist: fetchContext.originalTwist || options.originalTwist || twist,
    draftedRound: Number.isFinite(Number(fetchContext.draftedRound)) ? Number(fetchContext.draftedRound) : null,
    nearbyEntries: [
      ...(Array.isArray(options && options.roundPool) ? options.roundPool : []),
      ...(Array.isArray(options && options.teamPool) ? options.teamPool : [])
    ].filter(Boolean).slice(0, 40),
    fastRoundMode: hasOwn('fastRoundMode')
      ? Boolean(options.fastRoundMode)
      : Boolean(options && options.evaluationMode === 'round' && !roundQualityPass),
    roundQualityPass,
    skipImageEnrichment: hasOwn('skipImageEnrichment')
      ? Boolean(options.skipImageEnrichment)
      : Boolean(options && options.evaluationMode === 'round' && !roundQualityPass),
    skipImageBackfill: hasOwn('skipImageBackfill')
      ? Boolean(options.skipImageBackfill)
      : Boolean(options && options.evaluationMode === 'round' && !roundQualityPass),
    skipIdentityUpgrade: Boolean(options && options.skipIdentityUpgrade),
    skipExternalFactEnrichment: hasOwn('skipExternalFactEnrichment')
      ? Boolean(options.skipExternalFactEnrichment)
      : Boolean(options && options.evaluationMode === 'round'),
    skipSyntheticImageUpgrade: Boolean(options && options.skipSyntheticImageUpgrade),
    fastAliasOverride: Boolean(options && options.fastAliasOverride),
    aliasOverrideBudgetMs: Number(options && options.aliasOverrideBudgetMs) || undefined,
    imageBackfillTimeoutMs: Number(options && options.imageBackfillTimeoutMs) || undefined,
    imageBackfillBudgetMs: Number(options && options.imageBackfillBudgetMs) || undefined,
    maxImageBackfillQueries: Number(options && options.maxImageBackfillQueries) || undefined,
    preferSummaryFirst: hasOwn('preferSummaryFirst') ? Boolean(options.preferSummaryFirst) : undefined,
    identityUpgradeBudgetMs: Number(options && options.identityUpgradeBudgetMs) || undefined,
    roundResolveTimeoutMs: Number(options && options.roundResolveTimeoutMs) || undefined,
    roundKnownEntityProbeMs: Number(options && options.roundKnownEntityProbeMs) || undefined,
    roundAliasOverrideTimeoutMs: Number(options && options.roundAliasOverrideTimeoutMs) || undefined,
    externalFactTimeoutMs: Number(options && options.externalFactTimeoutMs) || undefined
  };
}

function buildResolverFetchCueText(fetchOptions = {}) {
  const parts = [
    ...(Array.isArray(fetchOptions && fetchOptions.contextHints) ? fetchOptions.contextHints : []),
    ...(Array.isArray(fetchOptions && fetchOptions.entityHints) ? fetchOptions.entityHints : []),
    ...(Array.isArray(fetchOptions && fetchOptions.nearbyEntries) ? fetchOptions.nearbyEntries : []),
    fetchOptions && fetchOptions.scenario,
    fetchOptions && fetchOptions.twist,
    fetchOptions && fetchOptions.originalScenario,
    fetchOptions && fetchOptions.originalTwist
  ];
  return normalizeName(parts.filter(Boolean).join(' ')).toLowerCase();
}

function fetchOptionsHaveMarvelDcCue(fetchOptions = {}) {
  const cueText = buildResolverFetchCueText(fetchOptions);
  const cueCompact = canonicalizeName(cueText);
  return /marvel|dc comics|superhero|comic book|justice league|teen titans|batman|gotham/.test(cueText)
    || /marveldc|dccomics|comicbook|justiceleague|teentitans/.test(cueCompact);
}

function fetchOptionsHaveOnePieceCue(fetchOptions = {}) {
  const cueText = buildResolverFetchCueText(fetchOptions);
  const cueCompact = canonicalizeName(cueText);
  return /one piece|luffy|zoro|nami|sanji|straw hat/.test(cueText)
    || /onepiece|strawhat/.test(cueCompact);
}

function buildDynamicAliasOverride(character, fetchOptions = {}) {
  const compact = canonicalizeName(character);
  if (!compact) return null;
  if (RESOLVER_QUOTE_ALIAS_OVERRIDES[compact]) {
    return {
      queries: RESOLVER_QUOTE_ALIAS_OVERRIDES[compact],
      rejectTitles: ['disambiguation'],
      allowTitles: []
    };
  }
  if (RESOLVER_MONIKER_OVERRIDES[compact]) {
    return {
      queries: RESOLVER_MONIKER_OVERRIDES[compact],
      rejectTitles: ['disambiguation'],
      allowTitles: []
    };
  }
  if (compact.startsWith('mt') && /\bmt\.?\b/i.test(character)) {
    return {
      queries: [String(character).replace(/\bMt\.?\b/gi, 'Mount')],
      rejectTitles: [],
      allowTitles: []
    };
  }
  const nearbyCanonicals = new Set(
    (Array.isArray(fetchOptions && fetchOptions.nearbyEntries) ? fetchOptions.nearbyEntries : [])
      .map((entry) => canonicalizeName(entry))
      .filter(Boolean)
  );

  const hasMarioCues = ['mario', 'luigi', 'bowser', 'yoshi', 'toad', 'rosalina', 'wario', 'waluigi', 'princesspeach']
    .some((cue) => nearbyCanonicals.has(cue));
  const hasOnePieceCues = ['luffy', 'zoro', 'nami', 'sanji', 'usopp', 'chopper', 'franky', 'brook', 'jinbe', 'jinbei', 'onepiece']
    .some((cue) => nearbyCanonicals.has(cue)) || fetchOptionsHaveOnePieceCue(fetchOptions);
  const hasDcBatmanCues = ['batman', 'robin', 'nightwing', 'gotham', 'joker']
    .some((cue) => nearbyCanonicals.has(cue)) || fetchOptionsHaveMarvelDcCue(fetchOptions);
  const hasTeenTitansCues = ['raven', 'starfire', 'beastboy', 'cyborg', 'nightwing', 'robin']
    .some((cue) => nearbyCanonicals.has(cue)) || fetchOptionsHaveMarvelDcCue(fetchOptions);

  if (compact === 'peach' && hasMarioCues) {
    return {
      queries: ['Princess Peach', 'Peach'],
      rejectTitles: ['Peach (disambiguation)'],
      allowTitles: ['Princess Peach']
    };
  }

  if (compact === 'robin') {
    if (hasDcBatmanCues) {
      return {
        queries: ['Robin (DC Comics)', 'Robin'],
        rejectTitles: ['Robin (disambiguation)', 'Nico Robin'],
        allowTitles: ['Robin (DC Comics)', 'Robin']
      };
    }
    if (hasOnePieceCues) {
      return {
        queries: ['Nico Robin (One Piece)', 'Nico Robin', 'Robin (One Piece)'],
        rejectTitles: ['Robin (disambiguation)'],
        allowTitles: ['Nico Robin (One Piece)', 'Nico Robin', 'Robin (One Piece)']
      };
    }
  }

  if (compact === 'raven' && hasTeenTitansCues) {
    return {
      queries: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)'],
      rejectTitles: ['Raven (bird)', 'Common raven', 'Raven (disambiguation)'],
      allowTitles: ['Raven (DC Comics)', 'Raven (Teen Titans)', 'Raven (character)']
    };
  }

  if (compact === 'starfire' && hasTeenTitansCues) {
    return {
      queries: ['Starfire (Teen Titans)', 'Starfire', "Koriand'r"],
      rejectTitles: ['Starfire (disambiguation)', 'Starfire (band)'],
      allowTitles: ['Starfire (Teen Titans)', 'Starfire', "Koriand'r"]
    };
  }

  if ((compact === 'cap' || compact === 'capshield' || compact === 'capamerica')) {
    const hasMarvelCues = ['captainamerica', 'ironman', 'thanos', 'wakanda', 'spiderman', 'tonystark', 'blackwidow']
      .some((cue) => nearbyCanonicals.has(cue));
    if (hasMarvelCues || compact !== 'cap') {
      return {
        queries: compact === 'capshield'
          ? ["Captain America's shield", 'Captain America']
          : ['Captain America', 'Steve Rogers'],
        rejectTitles: ['Cap (disambiguation)'],
        allowTitles: []
      };
    }
  }

  return null;
}

async function tryAliasResolutionOverride(character, info, fetchOptions = {}) {
  const compact = canonicalizeName(character);
  const leetCompact = canonicalizeName(String(character || '')
    .replace(/[0]/g, 'o')
    .replace(/[1]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't'));
  const dynamicOverride = buildDynamicAliasOverride(character, fetchOptions);
  const override = dynamicOverride
    || (compact ? RESOLUTION_ALIAS_OVERRIDES[compact] : null)
    || (leetCompact ? RESOLUTION_ALIAS_OVERRIDES[leetCompact] : null);
  if (!override || !Array.isArray(override.queries) || !override.queries.length) return info;

  const currentTitle = String(info && info.title || '').trim().toLowerCase();
  const allowTitles = Array.isArray(override.allowTitles) ? override.allowTitles : [];
  const isAlreadyAllowed = allowTitles.some((title) => currentTitle === String(title || '').trim().toLowerCase());
  const shouldOverride = !isAlreadyAllowed;
  if (!shouldOverride) return info;

  const isFastRound = String((fetchOptions && fetchOptions.mode) || '').toLowerCase() === 'round'
    && fetchOptions.fastRoundMode !== false;
  const isFastAlias = Boolean(fetchOptions && fetchOptions.fastAliasOverride) || isFastRound;
  const aliasBudgetMs = Math.max(250, Number(fetchOptions && fetchOptions.roundAliasOverrideTimeoutMs) || ROUND_ALIAS_OVERRIDE_TIMEOUT_MS);
  const contextHints = Array.isArray(fetchOptions.contextHints) ? fetchOptions.contextHints : [];
  const entityHints = Array.isArray(fetchOptions.entityHints) ? fetchOptions.entityHints : [];
  const aliasDeadlineAt = buildDeadlineAt(fetchOptions, {
    deadlineKey: 'aliasOverrideDeadlineAt',
    budgetKey: 'aliasOverrideBudgetMs',
    fallbackBudgetMs: isFastAlias ? aliasBudgetMs : 0
  });
  const exactTimeout = isFastAlias ? Math.min(aliasBudgetMs, IMAGE_BACKFILL_TIMEOUT_MS) : Math.min(1000, IMAGE_BACKFILL_TIMEOUT_MS);
  const searchTimeout = isFastAlias ? Math.min(aliasBudgetMs, IMAGE_BACKFILL_TIMEOUT_MS) : Math.min(1200, IMAGE_BACKFILL_TIMEOUT_MS + 200);
  const summaryTimeout = isFastAlias ? Math.min(aliasBudgetMs, IMAGE_BACKFILL_TIMEOUT_MS) : Math.min(1200, IMAGE_BACKFILL_TIMEOUT_MS + 200);
  const queriesToTry = (Array.isArray(override.queries) ? override.queries : []).slice(0, isFastAlias ? 1 : 3);
  const preferImage = !isFastAlias;
  let heldCandidate = null;

  function normalizeOverrideHit(candidate, defaultConfidence, defaultBand) {
    if (!candidate || !candidate.title || !candidateAccepted(candidate)) return null;
    return {
      ...candidate,
      confidence: Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : defaultConfidence,
      confidenceBand: candidate.confidenceBand || defaultBand
    };
  }

  function consumeCandidate(candidate) {
    if (!candidate) return null;
    if (candidate.imageUrl || !preferImage) return candidate;
    if (!heldCandidate) heldCandidate = candidate;
    return null;
  }

  function candidateAccepted(candidate) {
    if (!candidate || !candidate.title) return false;
    const title = String(candidate.title).trim().toLowerCase();
    const rejects = Array.isArray(override.rejectTitles) ? override.rejectTitles : [];
    if (rejects.some((value) => title === String(value || '').trim().toLowerCase())) return false;
    if (!allowTitles.length) return true;
    return allowTitles.some((value) => title === String(value || '').trim().toLowerCase());
  }

  for (const query of queriesToTry) {
    if (deadlineExpired(aliasDeadlineAt)) break;
    const exact = await withTimeout(fetchFromWikipediaEnhanced(query), exactTimeout);
    {
      const hit = consumeCandidate(normalizeOverrideHit(exact, 0.86, 'high'));
      if (hit) return hit;
    }

    if (isFastAlias) {
      // In fast round mode, only do one cheap alias attempt before deferring to the global round-budgeted resolver.
      // This preserves speed under vague/weird inputs.
      if (deadlineExpired(aliasDeadlineAt)) break;
      const summary = await withTimeout(fetchFromWikipediaSummary(query), summaryTimeout);
      {
        const hit = consumeCandidate(normalizeOverrideHit(summary, 0.8, 'medium'));
        if (hit) return hit;
      }
      continue;
    }

    if (deadlineExpired(aliasDeadlineAt)) break;
    const searched = await withTimeout(
      fetchFromWikipediaSearchEnhanced(query, contextHints.slice(0, 2), entityHints.slice(0, 2)),
      searchTimeout
    );
    {
      const hit = consumeCandidate(normalizeOverrideHit(searched, 0.82, 'high'));
      if (hit) return hit;
    }

    if (deadlineExpired(aliasDeadlineAt)) break;
    const summary = await withTimeout(fetchFromWikipediaSummary(query), summaryTimeout);
    {
      const hit = consumeCandidate(normalizeOverrideHit(summary, 0.8, 'medium'));
      if (hit) return hit;
    }
  }

  return heldCandidate || info;
}

function applyKnownResolutionPatches(character, info, fetchOptions = {}) {
  const safeInfo = info && typeof info === 'object' ? info : null;
  if (!safeInfo) return info;
  const compact = canonicalizeName(character);
  const title = String(safeInfo.title || '').trim();
  const cueText = buildResolverFetchCueText(fetchOptions);
  const hasMarvelDcCue = fetchOptionsHaveMarvelDcCue(fetchOptions);
  const hasOnePieceCue = fetchOptionsHaveOnePieceCue(fetchOptions);

  if (compact === 'swampert' && /list of generation iii pok[eé]mon/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Swampert',
      description: 'Swampert is a Water/Ground-type Pokémon introduced in Generation III and the final evolution of Mudkip.'
    };
  }

  if (compact === 'piesymbol' && /^symbol$/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Pi',
      description: 'Pi (π) is the mathematical constant representing the ratio of a circle’s circumference to its diameter.'
    };
  }

  if (compact === 'luffygear5' && /luffy/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Gear 5 refers to Luffy's awakened form with reality-bending, cartoon-like elasticity and a major combat/creativity power spike.`.trim()
    };
  }

  if (compact === 'rocky' || compact === 'rockybalboa') {
    const knownRocky = buildFastKnownEntityInfo(character, fetchOptions, safeInfo);
    if (knownRocky) return knownRocky;
  }

  if (compact === 'ashitaka' && (/mount ashitaka/i.test(title) || /princess mononoke/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'Ashitaka',
      description: 'Ashitaka is the exiled prince protagonist of Princess Mononoke, known for courage, mobility, wilderness survival, and calm decision-making under environmental crisis.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'bmo' && (/bank of montreal|islands \(miniseries\)|adventure time/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'BMO (Adventure Time)',
      description: 'BMO is a sentient console companion from Adventure Time with gadget-like utility, adaptability, and creative problem-solving in unpredictable situations.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'h2o' && /\bwater\b/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'pbj' && /peanut butter and jelly/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Peanut butter and jelly sandwich',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'cpu' && /central processing unit|cpu/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Central processing unit',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'aquaoshinoko') {
    const corpus = `${title} ${String(safeInfo.description || '')}`;
    if (/aquamarine hoshino|aqua hoshino|oshi no ko/i.test(corpus)) {
      return {
        ...safeInfo,
        title: /aquamarine hoshino/i.test(corpus) ? 'Aquamarine Hoshino' : 'Aqua Hoshino',
        description: 'Aquamarine "Aqua" Hoshino is a central character in Oshi no Ko, known for deduction, investigation, social maneuvering, and strategic planning under pressure.',
        confidence: Math.max(Number(safeInfo.confidence) || 0, 0.86),
        confidenceBand: 'high'
      };
    }
    if (/\baqua\b|latin word for water|water/i.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Aquamarine Hoshino',
        description: 'Aquamarine "Aqua" Hoshino is a central character in Oshi no Ko, known for deduction and calculated planning. The qualifier "Oshi no Ko" indicates the anime character identity, not the generic word aqua.',
        imageUrl: null,
        imageSynthetic: true,
        confidence: Math.max(Number(safeInfo.confidence) || 0, 0.74),
        confidenceBand: 'medium'
      };
    }
  }

  if (compact === 'drstone') {
    const corpus = `${title} ${String(safeInfo.description || '')}`;
    if (/senku ishigami/i.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Senku Ishigami',
        confidence: Math.max(Number(safeInfo.confidence) || 0, 0.9),
        confidenceBand: 'high'
      };
    }
    if (/dr\.?\s*stone|manga series|anime series/i.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Senku Ishigami',
        description: 'Senku Ishigami is the scientific prodigy protagonist of Dr. Stone, specializing in chemistry, engineering, and rebuilding systems under severe constraints. For gameplay, "Dr. Stone" is interpreted as Senku unless a series/media qualifier is explicit.',
        imageUrl: null,
        imageSynthetic: true,
        confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
        confidenceBand: 'high'
      };
    }
  }

  if (compact === 'n64' && /nintendo 64|n64/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Nintendo 64',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'r2' && /r2[- ]?d2|artoo/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'R2-D2',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'caesar' && /julius caesar|caesar \(title\)|roman dictator/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: /julius caesar/i.test(`${title} ${String(safeInfo.description || '')}`) ? 'Julius Caesar' : 'Caesar',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'colsanders' && /colonel sanders|kfc/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Colonel Sanders',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'katniss' && /katniss everdeen|hunger games/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Katniss Everdeen',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'ladygaga' && /lady gaga|stefani germanotta/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Lady Gaga',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'quinoa' && /\bquinoa\b/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Quinoa',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if ((compact === 'spam' || compact === 'spammusubi') && /\bspam\b.*\b(food|brand)|spiced ham|canned meat/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: compact === 'spam' ? 'Spam (food)' : 'Spam musubi',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'storm' && /marvel|x-men|ororo munroe|storm\b/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Storm (Marvel Comics)',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'skyrim' && /elder scrolls v: skyrim|skyrim/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'The Elder Scrolls V: Skyrim',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'tmnt' && /teenage mutant ninja turtles|tmnt/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Teenage Mutant Ninja Turtles',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'frozone' && (/frozen \(musical\)|frozen \(franchise\)/i.test(title) || !/frozone|lucius best/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'Frozone',
      description: 'Frozone (Lucius Best) is an Incredibles superhero with ice-generation powers, mobility control, and rescue utility under pressure.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'high'
    };
  }

  if (compact === 'magnetohelmet' && /magneto/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Magneto',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Interpreted as Magneto-related gear (helmet), so scoring may emphasize protection/control utility rather than full character capability.`.trim(),
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'high'
    };
  }

  if (compact === 'hadesunderworld' && (/hades|underworld|greek mythology/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: /underworld/i.test(title) && !/hades/i.test(title) ? 'Greek underworld' : 'Hades',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'cybertron' && (/cybertron|transformers/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'Cybertron',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'wakandan' && (/wakanda|wakandan/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'Wakanda',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'rdr2' && /red dead redemption 2|rdr2/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Red Dead Redemption 2',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'zeldabotw' && /breath of the wild|legend of zelda/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'The Legend of Zelda: Breath of the Wild',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'pepsimax' && /pepsi max|pepsi zero sugar/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: /pepsi max/i.test(title) ? 'Pepsi Max' : 'Pepsi Zero Sugar',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'mountfujisan' && /mount fuji/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Mount Fuji',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'saitma' && (/saitama|one-punch man/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: /one-punch man/i.test(title) ? 'Saitama' : (safeInfo.title || 'Saitama'),
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Saitama is the One-Punch Man protagonist, an overwhelmingly powerful hero often mismatched to technical or specialist contexts.`.trim(),
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'bluey' && /bluey/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Bluey',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'macbook' && /macbook/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'MacBook',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'dochudson' && !/doc hudson/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Doc Hudson',
      description: 'Doc Hudson is the veteran racer and mentor from Pixar\'s Cars, known for racing experience, discipline, precision driving, and tactical coaching under pressure.',
      imageUrl: /hudson hornet|cars/i.test(`${title} ${String(safeInfo.description || '')}`) ? safeInfo.imageUrl : null,
      imageSynthetic: /hudson hornet|cars/i.test(`${title} ${String(safeInfo.description || '')}`)
        ? Boolean(safeInfo.imageSynthetic)
        : true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'mac5' && !/mach five|speed racer/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Mach Five',
      description: 'The Mach Five is Speed Racer\'s iconic high-performance race car, known for specialized gadgets, speed, and precision maneuvering in dangerous competitions.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'theking' && !/strip weathers|cars/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Strip Weathers',
      description: 'Strip "The King" Weathers is a legendary race car from Pixar\'s Cars, known for elite track performance, consistency, and veteran leadership.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'turbo' && !/turbo \(film\)|animated film|snail|dreamworks/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Turbo (film character)',
      description: 'Turbo is the speed-powered snail protagonist from DreamWorks\' Turbo, associated with acceleration, agility bursts, and underdog racing performance.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'babydriver' && !/baby driver|2017 action film|ansel elgort|edgar wright/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Baby (Baby Driver)',
      description: 'Baby is the precision getaway driver protagonist from the film Baby Driver, associated with high-speed control, timing, and evasive tactical driving.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'billiee' && /billie eilish/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Billie Eilish',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'tpain' && /t-pain/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'T-Pain',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'spammusubi' && (/spam musubi|musubi/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'Spam musubi',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'biggiesmalls' && (/notorious b\.?i\.?g|biggie smalls|christopher wallace/i.test(`${title} ${String(safeInfo.description || '')}`))) {
    return {
      ...safeInfo,
      title: 'The Notorious B.I.G.',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'rbg' && /ruth bader ginsburg|rbg/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Ruth Bader Ginsburg',
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'katara' && /katara|avatar: the last airbender/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Katara',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Katara is a waterbending strategist and team anchor with leadership, control, and rescue utility.`.trim(),
      imageUrl: safeInfo.imageUrl || null,
      imageSynthetic: Boolean(safeInfo.imageSynthetic),
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'tchalla' && /black panther|t['’]?challa/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: "T'Challa",
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} T'Challa is the Black Panther, a strategist-king with advanced combat training, leadership, and Wakandan tech support context.`.trim(),
      imageUrl: safeInfo.imageUrl || null,
      imageSynthetic: Boolean(safeInfo.imageSynthetic),
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'mclovin' && /superbad/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'McLovin',
      description: 'McLovin is a comedic teen persona from Superbad associated with chaos, social improvisation, and unreliable execution under pressure.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'wakko' && /animaniacs/i.test(`${title} ${String(safeInfo.description || '')}`) && !/wakko/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Wakko Warner',
      description: 'Wakko Warner is an Animaniacs character known for chaotic comedy, rapid improvisation, and unpredictable cartoon problem-solving.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'stormtrooper' && /stormtrooper in drag/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Stormtrooper',
      description: 'A stormtrooper is an armored soldier in Star Wars, typically a mass-produced infantry combat unit with rigid doctrine and uneven precision performance.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'subzerro' && /sub zero project/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Sub-Zero',
      description: 'Sub-Zero is a Mortal Kombat fighter known for cryomancy, combat discipline, and control-focused battlefield tactics.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'countdracula' && /mina harker/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Count Dracula',
      description: 'Count Dracula is the iconic vampire noble from gothic fiction, associated with predation, manipulation, supernatural power, and nocturnal strategy.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'themyscira' && !/themyscira/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Themyscira',
      description: 'Themyscira is the Amazon homeland in DC Comics, a fortified mythic island associated with Wonder Woman and disciplined warrior culture.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'bowserjr' && /bowser\b/i.test(`${title} ${String(safeInfo.description || '')}`) && !/bowser jr/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Bowser Jr.',
      description: 'Bowser Jr. is a Mario franchise villain and tactical troublemaker with gadgets, mobility options, and chaotic team disruption potential.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'bowserjr' && !/bowser jr/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Bowser Jr.',
      description: 'Bowser Jr. is a Mario franchise antagonist with gadget support, mobility, and chaotic tactical interference.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'medium'
    };
  }

  if ((compact === 'winnethepooh' || compact === 'winniethepooh') && /my friends tigger.*pooh/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Winnie-the-Pooh',
      description: 'Winnie-the-Pooh is the classic A. A. Milne/Disney bear character associated with calm friendship, simple problem-solving, and gentle teamwork.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'magneto' && !/magneto/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Magneto',
      description: 'Magneto is a powerful Marvel mutant with magnetic control, battlefield manipulation, and high destructive potential.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'fryfuturama' && !/fry|futurama/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Philip J. Fry',
      description: 'Philip J. Fry is the Futurama protagonist, a chaotic but adaptable courier who is not a precision technical specialist.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'laracroftog' && !/lara croft|tomb raider/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Lara Croft',
      description: 'Lara Croft is the Tomb Raider adventurer known for field survival, mobility, puzzle-solving, and high-risk exploration operations.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'thegoat' && !/\bgoat\b|greatest of all time/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Goat',
      description: 'A goat is a hardy domesticated animal known for agility, balance, and rough-terrain adaptability.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if ((compact === 'crttv' || compact === 'crtmonitor' || compact === 'crt') && !/cathode|crt|television|monitor|display/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: compact === 'crt' ? 'Cathode-ray tube' : compact === 'crtmonitor' ? 'CRT monitor' : 'Cathode-ray tube television',
      description: 'A cathode-ray tube (CRT) display is an older analog display technology used in televisions and monitors before widespread flat-panel displays.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if ((compact === 'lcdscreen' || compact === 'lcd') && !/liquid[- ]crystal|lcd|display|monitor|television/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: compact === 'lcd' ? 'Liquid-crystal display' : 'LCD screen',
      description: 'A liquid-crystal display (LCD) is a flat-panel display technology used in monitors, televisions, laptops, and many electronic devices.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if ((compact === 'dococ' || compact === 'docock') && /(doctor octopus|doc ock)/i.test(title)) {
    return {
      ...safeInfo,
      title: /doctor octopus/i.test(title) ? title : 'Doctor Octopus',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Doctor Octopus (Doc Ock) is a high-intelligence supervillain scientist-engineer with advanced mechanical tentacles, tactical planning, and strong technical improvisation.`.trim()
    };
  }

  if (compact === 'hulk' && /hulk/i.test(title)) {
    return {
      ...safeInfo,
      title: /hulk/i.test(title) ? title : 'Hulk',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Hulk is an overwhelming power-focused form tied to Bruce Banner, but this version is less suited to precision scientific remediation and disciplined split-team coordination than Banner himself.`.trim()
    };
  }

  if (compact === 'thehulk' && /hulk/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Hulk',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Hulk is an overwhelming power-focused form tied to Bruce Banner, but this version is less suited to precision scientific remediation and disciplined split-team coordination than Banner himself.`.trim()
    };
  }

  if (compact === 'brucebanner' && (/hulk/i.test(title) || /bruce banner/i.test(title))) {
    return {
      ...safeInfo,
      title: /bruce banner/i.test(title) ? title : 'Bruce Banner',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Bruce Banner is a scientist and systems thinker associated with gamma research, technical problem-solving, and high-pressure analytical remediation.`.trim()
    };
  }

  if ((compact === 'jerrysienfield' || compact === 'jerryseinfeld') && /jerry seinfeld/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Jerry Seinfeld',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Jerry Seinfeld is a comedian and television creator with communication, timing, and team-performance leadership in live production settings.`.trim()
    };
  }

  if (compact === 'luffy' && /luffy/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Luffy is a pirate captain and elastic-bodied fighter known for creativity, leadership, resilience, and chaotic adaptability under pressure.`.trim()
    };
  }

  if (compact === 'naruto' && /naruto \(manga\)|naruto franchise|media franchise|anime series/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Naruto Uzumaki',
      description: 'Naruto Uzumaki is the central ninja protagonist of Naruto known for chakra-based combat, shadow-clone tactics, mobility, and resilience under pressure.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.78),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'frieren' && /frieren: beyond journey'?s end|anime series|manga series|media franchise/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Frieren',
      description: 'Frieren is an elven mage from Frieren: Beyond Journey\'s End known for high-level spellcasting, long-horizon strategy, and precise magical control.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if ((compact === 'mob' || compact === 'mobmobphysco' || compact === 'mobmobpsycho')
    && /mob psycho 100|anime series|media franchise/i.test(`${title} ${String(safeInfo.description || '')}`)
    && !/shigeo kageyama|mob \(mob psycho 100\)/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Shigeo Kageyama (Mob)',
      description: 'Shigeo Kageyama (Mob) is a psychic esper from Mob Psycho 100 known for telekinesis, energy output control, and extreme power spikes under stress.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.76),
      confidenceBand: 'medium'
    };
  }

  if ((compact === 'raven' || compact === 'raventeentitans')
    && !/raven \(dc comics\)|raven \(teen titans\)|raven \(character\)/i.test(`${title} ${String(safeInfo.description || '')}`)
    && /raven|teen titans|dc/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Raven (DC Comics)',
      description: 'Raven is a Teen Titans empath and sorceress from DC Comics known for dark-energy magic, teleportation, and mystical control.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'starfire') {
    return {
      ...safeInfo,
      source: 'known-entity-index',
      title: 'Starfire (Teen Titans)',
      description: 'Starfire (Koriand\'r) is a DC Comics and Teen Titans superhero with energy projection, flight, alien durability, combat ability, and team-centered judgment.',
      categories: uniqueResolverStrings([
        ...(Array.isArray(safeInfo.categories) ? safeInfo.categories : []),
        'DC Comics superhero',
        'Teen Titans',
        'Marvel & DC'
      ]),
      aliases: uniqueResolverStrings([
        ...(Array.isArray(safeInfo.aliases) ? safeInfo.aliases : []),
        'Starfire',
        "Koriand'r",
        'Teen Titans'
      ]),
      imageUrl: null,
      imageSynthetic: true,
      timeoutFallback: false,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.86),
      confidenceBand: 'high'
    };
  }

  if (compact === 'dipperpines' && /dipper pines/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Dipper is a resourceful mystery-solver with investigative instincts, survival improvisation, and strong decision-making under weird conditions.`.trim()
    };
  }

  if (compact === 'po' && /kung fu panda/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Po is a martial-arts hero with resilience, teamwork leadership, adaptability, and unconventional problem-solving in chaotic situations.`.trim()
    };
  }

  if (compact === 'peterparker' && /(spider-man|peter parker)/i.test(title)) {
    return {
      ...safeInfo,
      title: /peter parker/i.test(title) ? title : 'Peter Parker',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Peter Parker is Spider-Man, a superhuman hero with agility, strength, rapid reflexes, scientific intelligence, rescue experience, and team-coordination leadership under pressure.`.trim()
    };
  }

  if (compact === 'detectiveconan' && (/police academy arc/i.test(title) || /arc/i.test(title))) {
    return {
      ...safeInfo,
      title: 'Detective Conan',
      description: 'Detective Conan (Case Closed) centers on Conan Edogawa, a prodigy detective known for deduction, forensic reasoning, and high-volume case solving.',
      imageUrl: safeInfo.imageUrl || null,
      imageSynthetic: Boolean(safeInfo.imageSynthetic)
    };
  }

  if (compact === 'perrytheplatypus' && /^platypus$/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Perry the Platypus',
      description: 'Perry the Platypus (Agent P) is an undercover investigator/operative from Phineas and Ferb known for surveillance, infiltration, and mission problem-solving.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'monkeyddragon' && /^monkey(\s|\b)/i.test(title) && !/monkey d\.? dragon/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Monkey D. Dragon',
      description: 'Monkey D. Dragon is a One Piece revolutionary leader and strategist, distinct from generic monkey entries.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'margotrobbie' && (!/margot robbie|margot elise robbie/i.test(`${title} ${String(safeInfo.description || '')}`) || /^margot$/i.test(title))) {
    return {
      ...safeInfo,
      title: 'Margot Robbie',
      description: 'Margot Robbie is an Australian actress and producer known for high-profile film roles and performance-led screen work.',
      imageUrl: /margot robbie|margot elise robbie/i.test(`${title} ${String(safeInfo.description || '')}`)
        ? (safeInfo.imageUrl || null)
        : null,
      imageSynthetic: /margot robbie|margot elise robbie/i.test(`${title} ${String(safeInfo.description || '')}`)
        ? Boolean(safeInfo.imageSynthetic)
        : true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if ((compact === 'natskisubaru' || compact === 'natsukisubaru')
    && !/natsuki subaru|subaru natsuki|re:zero|rezero|re zero/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Natsuki Subaru',
      description: 'Natsuki Subaru is the central protagonist of Re:Zero, known for persistence, adaptation under repeated failure loops, and survival-focused decision-making.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'high'
    };
  }

  if (compact === 'emiyashirou' && !/shirou emiya|emiya shirou|fate\/stay night|fate series|fate\/zero/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Shirou Emiya',
      description: 'Shirou Emiya is a Fate/stay night protagonist known for idealistic resolve, tactical adaptability, and blade-projection combat specialization.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'medium'
    };
  }

  if (compact === 'kiritsugushirou' && !/kiritsugu emiya|fate\/zero|fate series/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Kiritsugu Emiya',
      description: 'Kiritsugu Emiya is a Fate/Zero strategist and assassin known for pragmatic planning, precision execution, and high-stakes decision-making.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.8),
      confidenceBand: 'medium'
    };
  }

  if ((compact === 'charilechaplin' || compact === 'charliechaplin') && !/charlie chaplin|charles chaplin/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Charlie Chaplin',
      description: 'Charlie Chaplin was an iconic actor, filmmaker, and comedian of the silent-film era known for visual storytelling and performance craft.',
      imageUrl: null,
      imageSynthetic: true,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.82),
      confidenceBand: 'high'
    };
  }

  if (compact === 'stitch' && (/lilo & stitch/i.test(title) || /franchise/i.test(String(safeInfo.description || '')))) {
    return {
      ...safeInfo,
      title: 'Stitch (Disney)',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Stitch is an engineered alien with extreme durability, strength, speed, survival instincts, and chaotic adaptability under pressure.`.trim()
    };
  }

  if (compact === 'ronaldmcdonald' && /ronald mcdonald/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Ronald McDonald is a fast-food mascot tied to food-service branding, crew-facing communication, and high-volume restaurant operations.`.trim()
    };
  }

  if (compact === 'peach' && /peach/i.test(title) && !/princess peach/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Princess Peach',
      description: 'Princess Peach is a Mario franchise leader known for composure, coordination, team support, and crisis management under pressure.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'robin' && hasMarvelDcCue) {
    return {
      ...safeInfo,
      source: 'known-entity-index',
      title: 'Robin (DC Comics)',
      description: 'Robin is a DC Comics superhero identity associated with Batman, Gotham, the Bat-family, Teen Titans, detective work, agility, gadgets, and team combat.',
      categories: uniqueResolverStrings([
        ...(Array.isArray(safeInfo.categories) ? safeInfo.categories : []),
        'DC Comics superhero',
        'Batman',
        'Teen Titans',
        'Marvel & DC'
      ]),
      aliases: uniqueResolverStrings([
        ...(Array.isArray(safeInfo.aliases) ? safeInfo.aliases : []),
        'Robin',
        'Robin (DC Comics)',
        'Dick Grayson',
        'Tim Drake',
        'Damian Wayne'
      ]),
      imageUrl: null,
      imageSynthetic: true,
      timeoutFallback: false,
      confidence: Math.max(Number(safeInfo.confidence) || 0, 0.84),
      confidenceBand: 'high'
    };
  }

  if (compact === 'robin'
    && (hasOnePieceCue || /one piece|luffy|straw hat/i.test(`${title} ${String(safeInfo.description || '')} ${cueText}`))
    && !/nico robin|one piece/i.test(`${title} ${String(safeInfo.description || '')}`)) {
    return {
      ...safeInfo,
      title: 'Nico Robin',
      description: 'Nico Robin is a One Piece archaeologist and strategist with intelligence, composure, field adaptability, and strong team coordination in complex operations.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'kimpossible') {
    const corpus = `${title} ${String(safeInfo.description || '')}`.toLowerCase();
    if (/tv series|television series|media franchise/.test(corpus) && !/character/.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Kim Possible (character)',
        description: 'Kim Possible is a teenage action hero and problem-solver known for field intelligence, agility, gadget use, and crisis response under pressure.',
        imageUrl: null,
        imageSynthetic: true
      };
    }
  }

  if (compact === 'kratos') {
    const corpus = `${title} ${String(safeInfo.description || '')}`.toLowerCase();
    if (!/god of war|video game|playstation/.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Kratos (God of War)',
        description: 'Kratos is the God of War protagonist, a demigod warrior with extreme strength and durability, but he is not a precision scientific remediation specialist.',
        imageUrl: null,
        imageSynthetic: true
      };
    }
  }

  if (compact === 'baki') {
    const corpus = `${title} ${String(safeInfo.description || '')}`.toLowerCase();
    if (!/baki|hanma|grappler/.test(corpus) || /disambiguation/.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Baki Hanma',
        description: 'Baki Hanma is a martial-arts prodigy focused on combat, durability, and physical adaptation rather than precision technical remediation.',
        imageUrl: null,
        imageSynthetic: true
      };
    }
  }

  if (compact === 'itadoriyuji' || compact === 'yujiitadori') {
    const corpus = `${title} ${String(safeInfo.description || '')}`.toLowerCase();
    if (!/yuji itadori|jujutsu kaisen/.test(corpus)) {
      return {
        ...safeInfo,
        title: 'Yuji Itadori',
        description: 'Yuji Itadori is a Jujutsu Kaisen fighter with high physical power, durability, and courage, but limited precision science/engineering specialization.',
        imageUrl: null,
        imageSynthetic: true
      };
    }
  }

  if (compact === 'frozone' && /mr\.?\s*incredible and pals/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Frozone',
      description: 'Frozone is Lucius Best, the ice-generating superhero ally from The Incredibles franchise known for mobility control and crowd management.'
    };
  }

  if (compact === 'dash' && /the incredibles/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Dash Parr',
      description: 'Dash Parr is the super-speed child hero from The Incredibles, built for rapid movement, scouting, and quick-response action.'
    };
  }

  if (compact === 'toothless' && /toothless catfish/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Toothless (How to Train Your Dragon)',
      description: 'Toothless is a highly adaptive dragon from How to Train Your Dragon known for mobility, precision control, fast reactions, and coordinated teamwork with a rider.',
      imageUrl: null,
      imageSynthetic: true
    };
  }

  if (compact === 'toothless' && (/how to train your dragon/i.test(String(safeInfo.description || '')) || /dreamworks dragons/i.test(title))) {
    return {
      ...safeInfo,
      title: /toothless/i.test(title) ? title : 'Toothless (How to Train Your Dragon)',
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Toothless contributes high mobility, rapid adaptation, and control in dangerous environments.`.trim(),
      imageUrl: /toothless/i.test(title) ? safeInfo.imageUrl : null,
      imageSynthetic: /toothless/i.test(title) ? Boolean(safeInfo.imageSynthetic) : true
    };
  }

  if (compact === 'toothless') {
    const corpus = `${title} ${String(safeInfo.description || '')}`.toLowerCase();
    const looksLikeTarget = /how to train your dragon|night fury|dragon/.test(corpus);
    if (!looksLikeTarget) {
      return {
        ...safeInfo,
        title: 'Toothless (How to Train Your Dragon)',
        description: 'Toothless is a dragon from How to Train Your Dragon known for mobility, adaptability, precision strikes, and coordinated teamwork in dangerous environments.',
        imageUrl: null,
        imageSynthetic: true
      };
    }
  }

  if (compact === 'bugsbunny' && /bugs bunny/i.test(title)) {
    return {
      ...safeInfo,
      description: `${String(safeInfo.description || '').replace(/\s+/g, ' ').trim()} Bugs Bunny operates with cartoon logic, deception, improvisation, and extreme survivability (toon-force style problem-solving).`.trim()
    };
  }

  if (compact === 'blackwidow' && /2021 film/i.test(title)) {
    return {
      ...safeInfo,
      title: 'Black Widow (Natasha Romanova)',
      description: 'Black Widow (Natasha Romanova) is a Marvel operative known for espionage, combat discipline, leadership, infiltration, and tactical execution under pressure.',
      imageUrl: safeInfo.imageUrl || null,
      imageSynthetic: Boolean(safeInfo.imageSynthetic)
    };
  }

  return safeInfo;
}

function buildRiskFlags({ info, confidence, trustedInfo, character }) {
  const flags = [];
  if (!info) {
    flags.push('no_match');
    return flags;
  }

  if (!trustedInfo) flags.push('low_confidence_match');
  if (confidence < 0.2) flags.push('very_low_confidence_match');
  if (!info.imageUrl) flags.push('no_image');
  if (info.imageSynthetic) flags.push('synthetic_image');
  if (info.genericAmbiguityFallback) flags.push('generic_name_ambiguity');
  if (info.lowSignalAmbiguityFallback) flags.push('low_signal_ambiguity');
  if (info.invalidInputFallback) flags.push('invalid_input');
  if (info.timeoutFallback) flags.push('fast_round_timeout_fallback');
  if (info.dangerousTitleDiffRescued) flags.push('dangerous_title_diff_rescued');
  if (info.source && String(info.source).toLowerCase().includes('fandom')) flags.push('secondary_source');
  const lookupMeta = info.lookupMeta && typeof info.lookupMeta === 'object' ? info.lookupMeta : null;

  const title = String(info.title || '').trim();
  if (title && canonicalizeName(title) !== canonicalizeName(character || '')) {
    const leetNormalizedCharacter = String(character || '')
      .replace(/[0]/g, 'o')
      .replace(/[1]/g, 'i')
      .replace(/[3]/g, 'e')
      .replace(/[4]/g, 'a')
      .replace(/[5]/g, 's')
      .replace(/[7]/g, 't');
    const benignTitleDiff = isBenignTitleDifference(character, title)
      || (leetNormalizedCharacter !== String(character || '')
        && isBenignTitleDifference(leetNormalizedCharacter, title));
    if (!benignTitleDiff) {
      flags.push('title_differs_from_input');
    }
    const titleCompactNoParens = canonicalizeName(String(title).replace(/\s*\([^)]*\)\s*/g, ' ').trim());
    const lookupMetaResolution = lookupMeta && lookupMeta.resolution && typeof lookupMeta.resolution === 'object'
      ? lookupMeta.resolution
      : null;
    const seededCanonical = lookupMetaResolution && lookupMetaResolution.canonical
      ? canonicalizeName(lookupMetaResolution.canonical)
      : '';
    const proxyOrAliasSeeded = lookupMetaResolution
      && ['alias-index', 'proxy-pattern', 'proxy-token-overlap'].includes(String(lookupMetaResolution.source || '').toLowerCase());
    const skipDangerousFlagForSeed = proxyOrAliasSeeded && seededCanonical && (
      seededCanonical === canonicalizeName(title)
      || (titleCompactNoParens && seededCanonical === titleCompactNoParens)
    );
    const dangerRisk = Number.isFinite(Number(info.dangerousTitleDiffRiskAfter))
      ? Number(info.dangerousTitleDiffRiskAfter)
      : estimateDangerousTitleDiffRisk(character, info);
    if (!benignTitleDiff && !skipDangerousFlagForSeed && !info.dangerousTitleDiffRescued && dangerRisk >= 6) {
      flags.push('dangerous_title_diff_suspected');
    }
  }

  if (lookupMeta && Number.isFinite(Number(lookupMeta.candidateCount)) && Number(lookupMeta.candidateCount) >= 10) {
    flags.push('high_candidate_ambiguity');
  }

  return Array.from(new Set(flags));
}

function buildResolutionFromSeed({ character, seed }) {
  const safeSeed = seed && typeof seed === 'object' ? seed : null;
  const scoringInfo = cloneJsonSafe(safeSeed && safeSeed.scoringInfo ? safeSeed.scoringInfo : null);
  if (!scoringInfo || typeof scoringInfo !== 'object') return null;

  const confidenceRaw = Number(
    safeSeed && safeSeed.infoConfidence != null ? safeSeed.infoConfidence : scoringInfo.confidence
  );
  const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 1) : 0;
  const seedStatus = String(safeSeed && safeSeed.resolutionStatus || '').toLowerCase();
  const trustedInfo = (safeSeed && safeSeed.trustedInfo === true) || seedStatus === 'trusted' || confidence >= MIN_INFO_CONFIDENCE
    ? scoringInfo
    : null;
  const normalizedName = normalizeName(
    (safeSeed && safeSeed.normalizedName) || scoringInfo.title || scoringInfo.name || character
  );
  const resolutionStatus = !scoringInfo
    ? 'unknown'
    : trustedInfo
      ? 'trusted'
      : 'low_confidence';

  return {
    ok: true,
    input: String(character || ''),
    normalizedName,
    compactName: canonicalizeName(normalizedName),
    info: scoringInfo,
    trustedInfo,
    scoringInfo,
    infoConfidence: confidence,
    resolutionStatus,
    fetchDurationMs: 0,
    source: safeSeed && safeSeed.source ? safeSeed.source : (scoringInfo.source || null),
    riskFlags: Array.isArray(safeSeed && safeSeed.riskFlags) && safeSeed.riskFlags.length
      ? Array.from(new Set(safeSeed.riskFlags.map((flag) => String(flag)).filter(Boolean))).slice(0, 12)
      : buildRiskFlags({ info: scoringInfo, confidence, trustedInfo, character }),
    confidenceBand: safeSeed && safeSeed.confidenceBand ? safeSeed.confidenceBand : (scoringInfo.confidenceBand || null),
    lookupMeta: safeSeed && safeSeed.lookupMeta ? cloneJsonSafe(safeSeed.lookupMeta) : (scoringInfo.lookupMeta || null),
    resolutionSource: 'seed'
  };
}

async function resolveEntryIdentity(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const character = String(payload.character || payload.input || '').trim();
  const scenario = String(payload.scenario || '').trim();
  const twist = String(payload.twist || '').trim();
  const options = payload.options && typeof payload.options === 'object' ? payload.options : {};

  const startedAt = Date.now();
  const fetchOptions = buildFetchOptions(character, options, scenario, twist);
  const isRoundMode = String(fetchOptions.mode || '').toLowerCase() === 'round';
  const isFastRound = isRoundMode && fetchOptions.fastRoundMode !== false;
  const isBudgetedResolve = (
    (isRoundMode && isFastRound)
    || fetchOptions.roundQualityPass === true
    || Number(fetchOptions.roundResolveTimeoutMs) > 0
  );
  const compactInput = canonicalizeName(character);
  const roundAliasTimeoutMs = Math.max(250, Number(fetchOptions.roundAliasOverrideTimeoutMs) || ROUND_ALIAS_OVERRIDE_TIMEOUT_MS);
  const roundResolveTimeoutMs = Math.max(250, Number(fetchOptions.roundResolveTimeoutMs) || ROUND_RESOLVE_TIMEOUT_MS);
  const validation = validateInput(character);
  if (!validation || validation.valid !== true) {
    const info = buildInvalidInputFallbackInfo(character, validation && validation.reason ? validation.reason : 'invalid');
    const confidence = Number(info.confidence) || 0;
    return {
      ok: true,
      input: character,
      normalizedName: normalizeName((info && (info.title || info.name)) || character),
      compactName: canonicalizeName((info && (info.title || info.name)) || character),
      info,
      trustedInfo: null,
      scoringInfo: info,
      infoConfidence: confidence,
      resolutionStatus: 'low_confidence',
      fetchDurationMs: Math.max(0, Date.now() - startedAt),
      source: info.source,
      riskFlags: buildRiskFlags({ info, confidence, trustedInfo: null, character }),
      confidenceBand: info.confidenceBand || 'low',
      lookupMeta: info.lookupMeta || null
    };
  }
  if (!fetchOptions.forceRefresh && options && options.resolutionSeed && typeof options.resolutionSeed === 'object') {
    let seeded = buildResolutionFromSeed({
      character,
      seed: options.resolutionSeed
    });
    if (seeded) {
      const upgradedIdentitySeedInfo = fetchOptions.skipIdentityUpgrade
        ? seeded.scoringInfo
        : await tryUpgradeLowFidelityIdentity(character, seeded.scoringInfo, fetchOptions);
      const syntheticReadySeedInfo = attachSyntheticImageIfNeeded(character, upgradedIdentitySeedInfo, fetchOptions);
      const upgradedSeedInfo = fetchOptions.skipSyntheticImageUpgrade
        ? syntheticReadySeedInfo
        : await tryUpgradeSyntheticImage(character, syntheticReadySeedInfo, fetchOptions);
      const backfilledSeedInfo = fetchOptions.skipImageBackfill
        ? upgradedSeedInfo
        : await tryBackfillImage(character, upgradedSeedInfo, fetchOptions);
      const finalSeedInfo = fetchOptions.skipIdentityUpgrade
        ? backfilledSeedInfo
        : await tryRescueDangerousTitleDiffIdentity(character, backfilledSeedInfo, fetchOptions);
      const enrichedSeedInfo = fetchOptions.skipExternalFactEnrichment
        ? finalSeedInfo
        : await tryEnrichIdentityFromExternalFacts(character, finalSeedInfo, fetchOptions);
      if (enrichedSeedInfo && enrichedSeedInfo !== seeded.scoringInfo) {
        const confidence = Number(seeded.infoConfidence) || 0;
        const trustedInfo = confidence >= MIN_INFO_CONFIDENCE ? enrichedSeedInfo : null;
        seeded = {
          ...seeded,
          info: enrichedSeedInfo,
          scoringInfo: enrichedSeedInfo,
          trustedInfo,
          riskFlags: buildRiskFlags({ info: enrichedSeedInfo, confidence, trustedInfo, character })
        };
      }
      return seeded;
    }
  }
  let aliasFirstInfo = null;
  const skipAliasFirst = isFastRound
    && character.split(/\s+/).filter(Boolean).length <= 1
    && FAST_ROUND_GENERIC_NAME_SKIP_ALIAS.has(compactInput);
  if (!skipAliasFirst) {
    try {
      if (isBudgetedResolve) {
        aliasFirstInfo = await withTimeout(
          tryAliasResolutionOverride(character, null, fetchOptions),
          Math.min(roundAliasTimeoutMs, Math.max(250, roundResolveTimeoutMs - 300))
        );
      } else {
        aliasFirstInfo = await tryAliasResolutionOverride(character, null, fetchOptions);
      }
    } catch (error) {
      aliasFirstInfo = null;
    }
  }

  const fetchedInfo = aliasFirstInfo || await fetchCharacterInfoWithRoundBudget(character, fetchOptions);
  let aliasCorrectedInfo = aliasFirstInfo || fetchedInfo;
  if (!isFastRound && !aliasFirstInfo && !skipAliasFirst) {
    aliasCorrectedInfo = isBudgetedResolve
      ? ((await withTimeout(
        tryAliasResolutionOverride(character, fetchedInfo, fetchOptions),
        Math.min(roundAliasTimeoutMs, Math.max(250, roundResolveTimeoutMs - 300))
      )) || fetchedInfo)
      : await tryAliasResolutionOverride(character, fetchedInfo, fetchOptions);
  }
  const upgradedIdentityInfo = fetchOptions.skipIdentityUpgrade
    ? aliasCorrectedInfo
    : await tryUpgradeLowFidelityIdentity(character, aliasCorrectedInfo, fetchOptions);
  const ambiguitySafeInfo = applyGenericNameAmbiguityFallback(character, upgradedIdentityInfo, fetchOptions);
  const lowSignalSafeInfo = applyLowSignalAmbiguityFallback(character, ambiguitySafeInfo, fetchOptions);
  const patchedInfo = applyKnownResolutionPatches(character, lowSignalSafeInfo, fetchOptions);
  const dangerousDiffRescuedInfo = fetchOptions.skipIdentityUpgrade
    ? patchedInfo
    : await tryRescueDangerousTitleDiffIdentity(character, patchedInfo, fetchOptions);
  const externalEnrichedInfo = fetchOptions.skipExternalFactEnrichment
    ? dangerousDiffRescuedInfo
    : await tryEnrichIdentityFromExternalFacts(character, dangerousDiffRescuedInfo, fetchOptions);
  const syntheticReadyInfo = attachSyntheticImageIfNeeded(character, externalEnrichedInfo, fetchOptions);
  const syntheticUpgradedInfo = fetchOptions.skipSyntheticImageUpgrade
    ? syntheticReadyInfo
    : await tryUpgradeSyntheticImage(character, syntheticReadyInfo, fetchOptions);
  const info = fetchOptions.skipImageBackfill
    ? syntheticUpgradedInfo
    : await tryBackfillImage(character, syntheticUpgradedInfo, fetchOptions);
  const fetchDurationMs = Math.max(0, Date.now() - startedAt);
  const confidence = info && typeof info.confidence === 'number'
    ? clamp(Number(info.confidence), 0, 1)
    : 0;
  const trustedInfo = info && confidence >= MIN_INFO_CONFIDENCE ? info : null;
  const scoringInfo = trustedInfo || info || null;
  const normalizedName = normalizeName(
    (scoringInfo && (scoringInfo.title || scoringInfo.name)) || character
  );

  const resolutionStatus = !scoringInfo
    ? 'unknown'
    : trustedInfo
      ? 'trusted'
      : 'low_confidence';

  const riskFlags = buildRiskFlags({
    info: scoringInfo,
    confidence,
    trustedInfo,
    character
  });

  return {
    ok: true,
    input: character,
    normalizedName,
    compactName: canonicalizeName(normalizedName),
    info,
    trustedInfo,
    scoringInfo,
    infoConfidence: confidence,
    resolutionStatus,
    fetchDurationMs,
    source: scoringInfo && scoringInfo.source ? scoringInfo.source : null,
    riskFlags,
    confidenceBand: scoringInfo && scoringInfo.confidenceBand ? scoringInfo.confidenceBand : null,
    lookupMeta: scoringInfo && scoringInfo.lookupMeta ? scoringInfo.lookupMeta : null
  };
}

module.exports = {
  resolveEntryIdentity
};
