(() => {
  const { register } = window.TokenCharacters
  const mix = (a, b, t) => a + (b - a) * t
  const ease = (t) => t * t * (3 - 2 * t)
  const pose = ({ phase, progress: p, startX, endX }, style = {}) => {
    const t = ease(p)
    if (phase === "resist") return { x: startX, y: -Math.sin(p * Math.PI * 4) * (style.resist ?? 2), rotate: -p * (style.lean ?? 10) }
    if (phase === "launch") return { x: mix(startX, startX - (style.launchX ?? 30), t), y: -Math.sin(t * Math.PI) * (style.launchY ?? 7), rotate: -(style.launchSpin ?? 50) * t }
    if (phase === "tumble") return { x: mix(startX - (style.launchX ?? 30), endX + (style.approach ?? 22), t), y: -Math.sin(t * Math.PI) * (style.arc ?? 7), rotate: -(style.spins ?? 1) * 360 * t - (style.launchSpin ?? 50) }
    const bounce = Math.sin(p * Math.PI)
    return { x: mix(endX + (style.approach ?? 22), endX, t), y: 2 - bounce * (style.bounce ?? 6), rotate: -(style.spins ?? 1) * 360 - (style.launchSpin ?? 50) + t * (style.launchSpin ?? 50), scaleX: 1 + bounce * .18, scaleY: 1 - bounce * .16 }
  }
  const baseCSS = (id, run, extra = "") => `
    .token-character[data-character="${id}"][data-phase="run"] .character-body{animation:${run} .42s steps(4) infinite;transform-origin:center bottom}
    .token-character[data-character="${id}"][data-phase="idle"] .character-body{animation:w2Idle 1.5s steps(4) infinite;transform-origin:center bottom}
    .token-character[data-character="${id}"][data-phase="resist"] .character-body{animation:w2Resist .16s steps(2) infinite;transform-origin:center bottom}
    .token-character[data-character="${id}"][data-phase="launch"] .character-body{animation:w2Launch .13s steps(2) infinite;transform-origin:center}
    .token-character[data-character="${id}"][data-phase="tumble"] .character-body{animation:w2Tumble .2s steps(3) infinite;transform-origin:center}
    .token-character[data-character="${id}"][data-phase="land"] .character-body{animation:w2Land .2s steps(3) infinite;transform-origin:center bottom}
    ${extra}`

  const style = document.createElement("style")
  style.dataset.tokenCharacterWave = "02"
  style.textContent = `
    .token-character .w2-accent{fill:var(--energy-flash);stroke:#17151e;stroke-width:3}
    @keyframes w2Idle{50%{transform:translateY(-1px)}}@keyframes w2Resist{to{transform:skewX(-6deg) translateX(1px)}}@keyframes w2Launch{to{transform:scaleX(.88) scaleY(1.08)}}@keyframes w2Tumble{50%{transform:rotate(12deg)}}@keyframes w2Land{50%{transform:scaleX(1.2) scaleY(.72)}}
    @keyframes penguinRun{25%{transform:translateY(-3px) rotate(-5deg)}75%{transform:translateY(-3px) rotate(5deg)}}@keyframes penguinSteam{to{transform:translate(-9px,-15px);opacity:0}}@keyframes penguinSteamBack{to{transform:translate(8px,12px);opacity:0}}
    @keyframes sheepRun{50%{transform:translateY(-6px) scaleY(1.04)}}@keyframes sheepBolt{50%{opacity:.16}}@keyframes sheepBurst{50%{transform:scaleX(1.28) scaleY(.72)}}
    @keyframes hamsterRun{50%{transform:translateY(-2px)}}@keyframes hamsterWheel{to{transform:rotate(360deg)}}@keyframes hamsterLoose{50%{transform:translate(8px,-7px) rotate(-35deg)}}
    @keyframes knightRun{50%{transform:translateY(-3px) skewX(-5deg)}}@keyframes knightLance{50%{transform:rotate(-9deg)}}@keyframes knightFlatten{50%{transform:scaleX(1.35) scaleY(.55)}}
    @keyframes tvRun{50%{transform:translateY(-4px) rotate(3deg)}}@keyframes tvStatic{to{transform:translateX(4px);opacity:.3}}@keyframes tvBreak{0%,100%{transform:translateX(-4px)}50%{transform:translateX(5px);opacity:.35}}
    @keyframes octoRun{50%{transform:translateY(-4px) rotate(-2deg)}}@keyframes octoLegs{50%{transform:skewX(16deg)}}@keyframes octoPropeller{to{transform:rotate(360deg) scaleX(.8)}}
    @keyframes boneRun{50%{transform:translateY(-5px) rotate(-3deg)}}@keyframes parcelRun{50%{transform:rotate(8deg)}}@keyframes boneLoose{50%{transform:scale(1.2) rotate(-18deg)}}
    @keyframes ufoRun{50%{transform:translateY(-6px) rotate(2deg)}}@keyframes ufoBeam{50%{opacity:.22}}@keyframes calfSwing{50%{transform:translate(5px,7px) rotate(10deg)}}
    @keyframes chickenRun{to{transform:translateY(-3px) rotate(-5deg)}}@keyframes chickenFuse{to{opacity:.2;transform:scale(.55)}}@keyframes chickenBlast{50%{filter:brightness(2);transform:scale(1.18)}}
    @keyframes crabRun{50%{transform:translateX(-5px) translateY(-2px)}}@keyframes crabClaws{50%{transform:scaleX(1.14)}}@keyframes crabStretch{50%{transform:scaleX(1.45) scaleY(.82)}}
    @keyframes jellyRun{50%{transform:translateY(-7px) scaleY(1.08)}}@keyframes jellyLegs{50%{transform:skewX(-15deg)}}@keyframes jellyTrail{50%{transform:scaleY(1.35);opacity:.55}}
    @keyframes brushRun{50%{transform:translateY(-5px) rotate(-8deg)}}@keyframes inkDrop{to{transform:translate(-15px,11px);opacity:0}}@keyframes brushSmear{50%{transform:skewX(-24deg) scaleX(1.28)}}
  `
  document.head.append(style)

  register({
    id:"steam-penguin",name:"蒸汽企鹅",width:35,height:41,
    svg:`<g class="character-body penguin"><ellipse class="deep" cx="34" cy="39" rx="17" ry="20"/><ellipse class="light" cx="38" cy="41" rx="11" ry="14"/><circle class="deep" cx="35" cy="18" r="13"/><path class="w2-accent" d="M46 19L60 24L46 28Z"/><circle class="eye-fill" cx="39" cy="16" r="2"/><rect class="main" x="12" y="27" width="13" height="22"/><path class="stroke" d="M14 27V20H22V27"/><g class="steam"><rect class="light" x="12" y="15" width="5" height="5"/><rect class="light" x="7" y="8" width="4" height="4"/></g><path class="stroke" d="M27 56H14M48 56H36"/></g>`,
    css:baseCSS("steam-penguin","penguinRun",`.token-character[data-character="steam-penguin"] .steam{animation:penguinSteam 1s steps(5) infinite}.token-character[data-character="steam-penguin"][data-phase="tumble"] .steam{animation:penguinSteamBack .18s steps(3) infinite}`),
    burstPose:c=>pose(c,{launchX:28,launchY:6,arc:6,spins:1.25,approach:21,bounce:6,lean:14}),
  })
  register({
    id:"thunder-sheep",name:"雷云绵羊",width:38,height:38,bottom:41,
    svg:`<g class="character-body sheep"><path class="light" d="M14 42Q5 35 13 27Q13 15 25 18Q33 8 42 18Q55 17 55 29Q64 38 53 44Z"/><circle class="deep" cx="51" cy="34" r="10"/><circle class="eye-fill" cx="55" cy="32" r="2"/><path class="stroke" d="M20 43V54M32 43V56M45 43V54"/><path class="bolt w2-accent" d="M28 43L22 53H29L24 63L40 49H33L38 43Z"/></g>`,
    css:baseCSS("thunder-sheep","sheepRun",`.token-character[data-character="thunder-sheep"] .bolt{animation:sheepBolt .3s steps(2) infinite}.token-character[data-character="thunder-sheep"][data-phase="land"] .character-body{animation:sheepBurst .2s steps(3) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:36,launchY:10,arc:9,spins:.25,approach:24,bounce:9,lean:20});if(c.phase==="tumble")p.opacity=.6+Math.abs(Math.sin(c.progress*Math.PI*5))*.4;return p},
  })
  register({
    id:"data-hamster",name:"数据轮仓鼠",width:38,height:38,
    svg:`<g class="character-body hamster-wrap"><circle class="wheel stroke" cx="32" cy="34" r="24"/><circle class="wheel stroke" cx="32" cy="34" r="16"/><g class="hamster"><ellipse class="main" cx="35" cy="38" rx="13" ry="10"/><circle class="light" cx="45" cy="31" r="8"/><circle class="main" cx="43" cy="23" r="4"/><circle class="eye-fill" cx="48" cy="30" r="2"/><path class="stroke" d="M29 45L23 51M40 45L47 50"/></g></g>`,
    css:baseCSS("data-hamster","hamsterRun",`.token-character[data-character="data-hamster"] .wheel{transform-origin:32px 34px;animation:hamsterWheel .7s steps(8) infinite}.token-character[data-character="data-hamster"][data-phase="tumble"] .hamster{animation:hamsterLoose .2s steps(3) infinite}`),
    burstPose:c=>pose(c,{launchX:24,launchY:4,arc:4,spins:3,approach:20,bounce:5,lean:6}),
  })
  register({
    id:"carton-knight",name:"纸箱骑士",width:35,height:41,
    svg:`<g class="character-body knight"><path class="w2-accent" d="M20 23H46V53H18V28Z"/><path class="deep" d="M22 11H45V29H20V16Z"/><path class="stroke" d="M24 19H42M31 13V27"/><rect class="eye-fill" x="35" y="18" width="6" height="3"/><path class="lance stroke" d="M39 36L62 18M52 21L60 29"/><path class="stroke" d="M23 52L17 60M40 52L47 60"/></g>`,
    css:baseCSS("carton-knight","knightRun",`.token-character[data-character="carton-knight"] .lance{transform-origin:40px 38px;animation:knightLance .36s steps(2) infinite}.token-character[data-character="carton-knight"][data-phase="land"] .character-body{animation:knightFlatten .2s steps(3) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:30,launchY:5,arc:5,spins:1.5,approach:22,bounce:5,lean:12});if(c.phase==="land"){p.scaleX=1.35;p.scaleY=.6}return p},
  })
  register({
    id:"static-goblin",name:"雪花屏小鬼",width:35,height:40,
    svg:`<g class="character-body tv"><rect class="deep" x="15" y="8" width="37" height="31"/><rect class="light" x="20" y="13" width="27" height="19"/><g class="static"><path class="stroke" d="M22 18H45M25 24H42M21 29H38"/></g><path class="stroke" d="M27 8L20 1M39 8L47 1M24 39L18 56M43 39L51 55M16 42L7 35M51 42L60 34"/></g>`,
    css:baseCSS("static-goblin","tvRun",`.token-character[data-character="static-goblin"] .static{animation:tvStatic .22s steps(2) infinite}.token-character[data-character="static-goblin"][data-phase="tumble"] .character-body{animation:tvBreak .16s steps(2) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:44,launchY:7,arc:5,spins:.75,approach:18,bounce:6,lean:20});if(c.phase==="tumble"){p.x+=Math.sin(c.progress*Math.PI*8)*8;p.opacity=Math.floor(c.progress*12)%3===1?.45:1;p.filter="brightness(1.6)"}return p},
  })
  register({
    id:"octo-skater",name:"八爪滑手",width:37,height:40,
    svg:`<g class="character-body octo"><path class="main" d="M18 35Q16 12 35 11Q54 13 52 35Z"/><circle class="eye-fill" cx="29" cy="25" r="3"/><circle class="eye-fill" cx="42" cy="25" r="3"/><g class="tentacles stroke"><path d="M21 35Q10 42 17 50M29 35Q21 48 29 54M38 35Q34 49 43 53M47 35Q56 43 50 52"/></g><circle class="w2-accent" cx="18" cy="54" r="5"/><circle class="w2-accent" cx="47" cy="56" r="5"/></g>`,
    css:baseCSS("octo-skater","octoRun",`.token-character[data-character="octo-skater"] .tentacles{transform-origin:center;animation:octoLegs .3s steps(3) infinite}.token-character[data-character="octo-skater"][data-phase="tumble"] .tentacles{animation:octoPropeller .18s steps(4) infinite}`),
    burstPose:c=>pose(c,{launchX:38,launchY:9,arc:8,spins:1,approach:23,bounce:8,lean:16}),
  })
  register({
    id:"bone-courier",name:"骨头快递员",width:34,height:42,
    svg:`<g class="character-body skeleton"><g class="parcel"><rect class="w2-accent" x="11" y="19" width="20" height="19"/><path class="stroke" d="M13 27H29"/></g><circle class="light" cx="38" cy="14" r="9"/><rect class="eye-fill" x="40" y="12" width="3" height="3"/><g class="bones stroke"><path d="M35 23L30 42M32 29L47 34L54 25M30 42L18 55M30 42L44 54M25 32H36M24 37H34"/></g></g>`,
    css:baseCSS("bone-courier","boneRun",`.token-character[data-character="bone-courier"] .parcel{transform-origin:22px 29px;animation:parcelRun .64s steps(4) infinite}.token-character[data-character="bone-courier"][data-phase="tumble"] .bones{animation:boneLoose .18s steps(3) infinite}`),
    burstPose:c=>pose(c,{launchX:34,launchY:7,arc:7,spins:2,approach:21,bounce:7,lean:18}),
  })
  register({
    id:"tractor-calf",name:"牵引光束小牛",width:40,height:42,bottom:40,
    svg:`<g class="character-body ufo"><g class="ufo-body"><path class="deep" d="M14 16Q32 0 50 16L58 23H6Z"/><ellipse class="main" cx="32" cy="23" rx="27" ry="8"/></g><path class="beam light" d="M18 28H46L52 58H12Z" opacity=".42"/><g class="calf" transform="translate(0 13)"><ellipse class="light" cx="32" cy="36" rx="13" ry="9"/><circle class="light" cx="44" cy="32" r="7"/><path class="deep" d="M42 26L39 20L46 25M47 27L52 21L51 29Z"/><circle class="eye-fill" cx="47" cy="31" r="2"/></g></g>`,
    css:baseCSS("tractor-calf","ufoRun",`.token-character[data-character="tractor-calf"] .beam{animation:ufoBeam .5s steps(3) infinite}.token-character[data-character="tractor-calf"][data-phase="tumble"] .calf{transform-origin:32px 42px;animation:calfSwing .18s steps(3) infinite}`),
    burstPose:c=>pose(c,{launchX:40,launchY:9,arc:9,spins:.5,approach:25,bounce:8,lean:18}),
  })
  register({
    id:"countdown-chicken",name:"倒计时鸡",width:37,height:40,
    svg:`<g class="character-body chicken"><circle class="deep" cx="20" cy="38" r="14"/><path class="stroke" d="M16 27L10 18M21 25L20 15"/><circle class="main" cx="40" cy="35" r="16"/><circle class="light" cx="49" cy="24" r="10"/><path class="w2-accent" d="M58 25L64 30L57 32Z"/><circle class="eye-fill" cx="52" cy="22" r="2"/><path class="stroke" d="M34 48L29 58M45 49L51 58"/><g class="fuse"><path class="stroke" d="M15 24Q12 11 4 12"/><rect class="w2-accent" x="1" y="8" width="6" height="6"/></g></g>`,
    css:baseCSS("countdown-chicken","chickenRun",`.token-character[data-character="countdown-chicken"] .fuse{transform-origin:5px 11px;animation:chickenFuse .2s steps(2) infinite}.token-character[data-character="countdown-chicken"][data-phase="launch"] .character-body{animation:chickenBlast .13s steps(2) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:36,launchY:8,arc:7,spins:1.75,approach:22,bounce:7,lean:18});if(c.phase==="launch")p.filter="brightness(2)";return p},
  })
  register({
    id:"magnet-crab",name:"磁铁螃蟹",width:40,height:38,
    svg:`<g class="character-body crab"><rect class="main" x="18" y="26" width="30" height="22"/><circle class="light" cx="26" cy="24" r="6"/><circle class="light" cx="41" cy="24" r="6"/><circle class="eye-fill" cx="27" cy="23" r="2"/><circle class="eye-fill" cx="42" cy="23" r="2"/><g class="claws"><path class="deep" d="M18 34Q5 22 4 36Q4 49 17 41L11 37L18 34Z"/><path class="deep" d="M48 34Q61 22 62 36Q62 49 49 41L55 37L48 34Z"/></g><path class="stroke" d="M22 48L14 57M31 48L27 59M41 48L48 58"/></g>`,
    css:baseCSS("magnet-crab","crabRun",`.token-character[data-character="magnet-crab"] .claws{transform-origin:center;animation:crabClaws .38s steps(2) infinite}.token-character[data-character="magnet-crab"][data-phase="resist"] .character-body{animation:crabStretch .16s steps(2) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:26,launchY:4,arc:4,spins:1,approach:20,bounce:5,lean:8});if(c.phase==="resist"){p.scaleX=1.18;p.scaleY=.86}return p},
  })
  register({
    id:"nebula-jelly",name:"星云水母",width:38,height:42,bottom:41,
    svg:`<g class="character-body jelly"><path class="deep" d="M11 34Q12 9 33 8Q55 10 55 34Z"/><path class="main" d="M17 31Q19 15 33 14Q47 16 49 31Z" opacity=".72"/><path class="w2-accent" d="M34 18L37 26L45 27L38 32L40 40L33 35L26 40L28 32L21 27L30 26Z"/><g class="jelly-legs stroke"><path d="M16 34Q8 47 16 59M27 34Q20 47 27 61M39 34Q47 46 39 60M50 34Q57 47 50 58"/></g></g>`,
    css:baseCSS("nebula-jelly","jellyRun",`.token-character[data-character="nebula-jelly"] .jelly-legs{transform-origin:center;animation:jellyLegs .5s steps(4) infinite}.token-character[data-character="nebula-jelly"][data-phase="tumble"] .jelly-legs{animation:jellyTrail .18s steps(3) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:38,launchY:10,arc:10,spins:.25,approach:24,bounce:9,lean:20});if(c.phase==="tumble")p.opacity=.5+Math.abs(Math.sin(c.progress*Math.PI*5))*.5;return p},
  })
  register({
    id:"ink-brush",name:"墨迹画笔怪",width:35,height:42,
    svg:`<g class="character-body brush"><path class="w2-accent" d="M38 5L50 13L31 44L18 37Z"/><path class="deep" d="M18 37L31 44L24 57Q15 61 8 55Q17 51 18 37Z"/><circle class="eye-fill" cx="32" cy="24" r="2"/><circle class="eye-fill" cx="40" cy="28" r="2"/><path class="stroke" d="M21 39L8 32M30 44L42 54M19 48L8 57"/><g class="inkdrop"><rect class="main" x="4" y="51" width="6" height="6"/><rect class="main" x="12" y="57" width="4" height="4"/></g></g>`,
    css:baseCSS("ink-brush","brushRun",`.token-character[data-character="ink-brush"] .inkdrop{animation:inkDrop .7s steps(5) infinite}.token-character[data-character="ink-brush"][data-phase="tumble"] .character-body{animation:brushSmear .18s steps(3) infinite}`),
    burstPose:c=>{const p=pose(c,{launchX:34,launchY:7,arc:6,spins:2,approach:21,bounce:6,lean:16});if(c.phase==="tumble")p.scaleX=1.12;return p},
  })
})()
