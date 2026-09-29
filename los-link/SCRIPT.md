# 視距無線電鏈路：頻率與通聯可達率
_Line-of-Sight Radio Links: Frequency & Link Availability_

總長 Duration: 08:00 · 10 章 chapters · 61 句 lines · Gemini TTS 旁白時間

旁白聲音 Voice: 熱情的科技講解語氣，台灣華語，抑揚頓挫明顯 / Energetic tech-explainer tone in Taiwanese Mandarin, lively intonation

## 01. 頻率為什麼影響通聯 — Why Frequency Matters  `00:00`

- `00:04` 同樣的電台、同樣的功率，換一個頻段，通聯結果可能完全不同。  
  Same radio, same power — switch bands, and the link can behave completely differently.
- `00:10` 這支影片比較兩個頻段：低頻段 1350 到 2690 MHz，高頻段 4400 到 5900 MHz。  
  We compare two bands: the low band, 1350 to 2690 MHz, and the high band, 4400 to 5900 MHz.
- `00:21` 我們從四個物理面向來看：距離損耗、菲涅爾區淨空、多路徑反射，以及植被與天氣。  
  We look at four physical factors: distance loss, Fresnel zone clearance, multipath reflections, and foliage and weather.
- `00:31` 最後，再把這些原理套進城市、森林、水面和山區等實際情境。  
  Then we apply them to real terrain: cities, forests, water and mountains.

## 02. 自由空間路徑損耗 — Free-Space Path Loss  `00:38`

- `00:39` 視距鏈路最基本的衰減，叫做自由空間路徑損耗，簡稱 FSPL。  
  The most basic loss on a line-of-sight link is free-space path loss, or FSPL.
- `00:47` 公式是：32.4，加上 20 log 頻率 MHz，再加上 20 log 距離公里。  
  FSPL in dB is 32.4, plus 20 log of the frequency in MHz, plus 20 log of the distance in km.
- `00:56` 記住兩個口訣：距離加倍，損耗多 6 dB；頻率加倍，損耗同樣多 6 dB。  
  Two rules of thumb: double the distance, add 6 dB; double the frequency, add another 6 dB.
- `01:05` 以 20 公里為例，1350 MHz 損耗約 121 dB，5900 MHz 約 134 dB，差了將近 13 dB。  
  At 20 km, the loss is about 121 dB at 1350 MHz and about 134 dB at 5900 MHz — nearly 13 dB apart.
- `01:17` 用 0.3 瓦、也就是 24.8 dBm 發射，兩端都是 0 dBi 天線，20 公里外，低頻約收到負 96 dBm，高頻只剩負 109 dBm。  
  Transmitting 0.3 W, or 24.8 dBm, with 0 dBi antennas, at 20 km you receive about −96 dBm on the low band but only −109 dBm on the high band.
- `01:31` 這些是套公式的示範數字，實際還要看天線增益、饋線損耗和接收靈敏度。  
  These are illustrative numbers; real links also depend on antenna gain, feeder loss and receiver sensitivity.

## 03. 頻率項從哪裡來 — Where the Frequency Term Comes From  `01:38`

- `01:40` 不過要澄清一個常見誤解：電波在空間中擴散，本身跟頻率無關。  
  But let's clear up a common misconception: the way energy spreads through space doesn't depend on frequency.
- `01:47` 公式裡會出現頻率，是因為它假設兩端都用等向天線。  
  The frequency term appears because the formula assumes isotropic antennas at both ends.
- `01:52` 等向天線的有效孔徑跟波長平方成正比，頻率越高，能接住的能量越少。  
  An isotropic antenna's effective aperture scales with wavelength squared, so the higher the frequency, the less energy it catches.
- `02:00` 反過來說，同樣大小的天線，在高頻反而有更高的增益。  
  Flip it around: an antenna of the same physical size has more gain at a higher frequency.
- `02:06` 所以用高增益天線補償後，高頻的實際鏈路餘裕差距，會比公式看起來小。  
  So with high-gain antennas, the real link-margin gap for the high band is smaller than the formula suggests.

## 04. 菲涅爾區淨空 — Fresnel Zone Clearance  `02:14`

- `02:15` 看得到對方，不代表鏈路就一定好。  
  Seeing the far end doesn't guarantee a good link.
- `02:18` 電波會在直線路徑周圍，形成一個橄欖球形的菲涅爾區。  
  Radio energy travels through a football-shaped Fresnel zone around the straight path.
- `02:24` 地形、樹木或建物一旦侵入這個區域，就會產生繞射損耗。  
  When terrain, trees or buildings intrude into it, you get diffraction loss.
- `02:30` 第一菲涅爾區半徑，等於 17.3 乘上根號，d1 乘 d2，除以頻率 GHz 乘總距離。  
  The first Fresnel radius is 17.3 times the square root of d1 times d2, over the frequency in GHz times the total distance.
- `02:41` 在 20 公里鏈路的正中央，1350 MHz 半徑約 33 公尺，5900 MHz 只有約 16 公尺。  
  At the midpoint of a 20 km link, the radius is about 33 m at 1350 MHz, but only about 16 m at 5900 MHz.
- `02:51` ITU-R P.530 建議，路徑至少要淨空第一菲涅爾區的 60%。  
  ITU-R P.530 recommends clearing at least 60% of the first Fresnel zone.
- `02:59` 換算下來，中點淨空低頻段要約 20 公尺，高頻段約 9.6 公尺。  
  That's about 20 m of midpoint clearance for the low band, and about 9.6 m for the high band.
- `03:06` 如果障礙物剛好貼著視線，視形狀而定，損耗可能高達 15 dB。  
  If an obstacle just grazes the line of sight, the loss can reach 15 dB, depending on its shape.

## 05. 中點速判與餘裕反推 — Midpoint Check & Margin  `03:13`

- `03:14` 實務上有個更快的判斷法：只看路徑正中央，這個最嚴苛的位置。  
  In practice there's a quicker check: look only at the midpoint, the tightest spot on the path.
- `03:21` 中點的 0.6 F1 淨空，約等於 5.2 乘上根號，距離公里除以頻率 GHz，單位是公尺。  
  The midpoint 0.6 F1 clearance is about 5.2 times the square root of distance in km over frequency in GHz, in meters.
- `03:30` 以 4700 MHz 為例：1.2 公里只要 2.6 公尺，10 公里要 7.6 公尺，30 公里要 13.1 公尺。  
  At 4700 MHz: 2.6 m for 1.2 km, 7.6 m for 10 km, and 13.1 m for 30 km.
- `03:40` 路徑中點附近的建物或樹木低於這個高度，就不必擔心。  
  If buildings or trees near the midpoint stay below that height, you're fine.
- `03:46` 但 0.6 F1 是零損耗的保守門檻，還可以用鏈路餘裕反推。  
  But 0.6 F1 is a conservative, zero-loss threshold — you can also work backward from the link margin.
- `03:52` 一條 1.2 公里、4700 MHz、餘裕 69 dB 的鏈路，障礙物剛好貼齊視線，只損失約 6 dB。  
  On a 1.2 km, 4700 MHz link with 69 dB of margin, an obstacle touching the line of sight costs only about 6 dB.
- `04:02` 就算障礙物突出視線 12 公尺，也只吃掉約 25 dB，還剩 44 dB。  
  Even 12 m above the line, it eats only about 25 dB, leaving 44 dB.
- `04:09` 不過地形資料多半抓不到建物和樹，最可靠的還是現地會勘，親眼確認看得到對方。  
  But terrain data usually misses buildings and trees — a site survey, confirming you can see the far end, is still the most reliable check.

## 06. 多路徑衰落 — Multipath Fading  `04:17`

- `04:19` 除了直射波，訊號也會經由地面或水面反射，走另一條路抵達。  
  Besides the direct wave, the signal also bounces off the ground or water and arrives by another path.
- `04:25` 兩條路徑長度不同，到達時相位也不同，就會互相疊加或抵消。  
  The two paths differ in length, so they arrive with different phases and add up or cancel out.
- `04:32` 路徑差約等於 2 乘 h1 乘 h2，除以距離。  
  The path difference is roughly 2 times h1 times h2, divided by the distance.
- `04:37` 兩端天線都是 10 公尺高、相距 10 公里，路徑差只有 2 公分。  
  With both antennas 10 m high and 10 km apart, the difference is only 2 cm.
- `04:43` 可是這 2 公分，在 1350 MHz 只佔波長的 9%，在 5900 MHz 卻佔了 39%。  
  Yet those 2 cm are 9% of a wavelength at 1350 MHz, but 39% at 5900 MHz.
- `04:53` 另外，低仰角的地面或水面反射，本身還會讓相位翻轉約 180 度。  
  On top of that, a low-angle reflection off ground or water flips the phase by about 180 degrees.
- `05:00` 所以高頻對天線高度和地形的小變化更敏感，更容易掉進深度衰落。  
  So the high band is more sensitive to small changes in antenna height and terrain, and falls into deep fades more easily.
- `05:07` 對策是：把天線架高，並避開貼近水面或平坦地面的路徑。  
  The remedy: mount antennas higher, and avoid paths that skim water or flat ground.

## 07. 植被與天氣 — Foliage & Weather  `05:14`

- `05:15` 低頻電波比較容易繞過或穿過樹葉這類小障礙物。  
  Lower frequencies bend around and pass through small obstacles like foliage more easily.
- `05:20` 高頻段在視距內幾乎像光一樣傳播，一被遮住，損耗就很明顯。  
  The high band travels almost like light — once it's blocked, the loss is significant.
- `05:27` 那下雨呢？在 6 GHz 以下，雨衰通常不顯著，要到 10 GHz 以上才明顯。  
  What about rain? Below 6 GHz, rain fade is usually minor; it becomes significant above 10 GHz.
- `05:36` 濕氣和霧，對頻段上緣可能有些微影響。  
  Humidity and fog may have a slight effect near the top of the band.
- `05:40` 另外，視距路徑的損耗指數約為 2，非視距環境可能升到 4 到 5。  
  Also, the path-loss exponent is about 2 with line of sight, but can rise to 4 or 5 without it.

## 08. 城市：非視距與屋頂鏈路 — Urban: NLOS vs. Rooftop Links  `05:48`

- `05:50` 在城市裡，訊號常要繞過轉角、穿過牆面；在這種真正的非視距環境，低頻段比較吃得開。  
  In a city, signals must bend around corners and through walls; in true non-line-of-sight conditions, the low band holds up better.
- `05:59` 但屋頂對屋頂、彼此看得到，只是周圍高樓很接近視線時，結果可能相反。  
  But rooftop to rooftop — with a clear view, but buildings close to the line — the result can flip.
- `06:07` 同一條 20 公里鏈路，障礙物在視線下方 15 公尺時，低頻損失約 1 dB，高頻幾乎沒有。  
  On the same 20 km link, with an obstacle 15 m below the line, the low band loses about 1 dB; the high band almost nothing.
- `06:17` 在視線下方 5 公尺，低頻 4.2 dB，高頻 2.4 dB，還是高頻佔優勢。  
  At 5 m below, it's 4.2 dB versus 2.4 dB — the high band still wins.
- `06:25` 可是一旦突出視線 5 公尺，低頻 7.9 dB，高頻 9.8 dB，低頻反而比較好。  
  But once it pokes 5 m above the line, it's 7.9 versus 9.8 dB — now the low band is better.
- `06:34` 交叉點，就在障礙物剛好碰到視線的位置。  
  The crossover sits right where the obstacle touches the line of sight.

## 09. 地形情境 — Terrain Scenarios  `06:39`

- `06:40` 開闊平地、長距離：路徑損耗是主角，低頻段餘裕較大，打得較遠。  
  Open, flat, long range: path loss dominates, and the low band has more margin and reach.
- `06:47` 森林或植被密集：低頻段的繞射和穿透能力比較好。  
  Dense forest or vegetation: the low band diffracts and penetrates better.
- `06:53` 水面與沿岸：反射強，多路徑衰落隨頻率升高，優先用低頻，並把天線架高。  
  Over water and along the coast: strong reflections and fading that grows with frequency — prefer the low band and mount antennas high.
- `07:02` 山區地形夾縫：高頻段菲涅爾區較窄，搭配高增益指向天線，反而容易找到淨空路徑。  
  Mountain gaps: the high band's thinner Fresnel zone, with a high-gain directional antenna, can actually find a clear path.
- `07:11` 不過高增益天線波束窄，對準精度要求也更高。  
  But a high-gain antenna has a narrow beam, so it demands more precise alignment.
- `07:16` 快速架設、對準條件不確定時：低頻段波束寬、對準容錯高，但需要的淨空高度較大。  
  Rapid setup with uncertain alignment: the low band's wide beam is forgiving, though it needs more clearance height.

## 10. 總結 — Wrap-up  `07:26`

- `07:27` 整理一下：大多數情境，低頻段損耗低、繞射好，也比較寬容。  
  To sum up: in most situations the low band has lower loss, better diffraction, and more tolerance.
- `07:34` 高頻段則在邊緣淨空、山區夾縫，或需要窄波束時，有機會勝出。  
  The high band can win with marginal clearance, in mountain gaps, or when you need a narrow beam.
- `07:41` 這些是物理原理層級的通則，實際選頻還要考慮頻譜派配、干擾、傳輸量和裝備規格。  
  These are physics-level rules of thumb; real band choices also weigh spectrum assignment, interference, throughput and equipment specs.
- `07:51` 最後，用鏈路預算工具算過，再到現地確認。  
  Finally, run the numbers in a link-budget tool, and confirm on site.
- `07:56` 謝謝收看！  
  Thanks for watching!

## 角色 Characters

- **小鏈 Link Radio** — 鏈路兩端的電台 / Radio at each end of the link：架在桅桿上的電台與天線。這支影片裡的每一條鏈路，都從它發射、由它接收。 / A mast-mounted radio and antenna. Every link in the video starts and ends here.
- **菲涅爾氣球 Fresnel Bubble** — 看不見的傳播區域 / The invisible propagation zone：包住直線路徑的橄欖球形區域。頻率越低越胖，被擋到就會產生繞射損耗。 / The football-shaped zone around the path. The lower the frequency, the fatter it gets; intrusions cause diffraction loss.
- **樹精 Tree** — 植被障礙 / Foliage obstacle：樹葉會吃掉訊號，而且會隨季節和含水量改變。高頻特別怕它。 / Leaves absorb signal, and the effect changes with season and moisture. The high band fears it most.
- **大樓 Building** — 城市障礙與架設點 / Urban obstacle and mounting point：可能擋住路徑，也可能是屋頂鏈路的架設點。地形資料通常抓不到它。 / It can block a path, or host a rooftop link. Terrain databases usually miss it.
- **雨雲 Rain Cloud** — 天氣因素 / Weather：在 6 GHz 以下，它的影響通常不大；到 10 GHz 以上才真的麻煩。 / Below 6 GHz its effect is usually small; it only really matters above 10 GHz.
