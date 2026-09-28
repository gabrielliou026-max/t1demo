# 電話信令 CAS 與 CCS：原理與設定
_Telephony Signaling: CAS & CCS — Concepts and Configuration_

總長 Duration: 06:06 · 10 章 chapters · 62 句 lines · Gemini TTS 旁白時間

旁白聲音 Voice: 台灣口音的年輕女性，溫暖、清楚、說故事的語氣，語速適中 / Young female voice with a Taiwanese Mandarin accent, warm and clear storytelling tone, moderate pace

## 01. 為什麼需要信令 — Why Signaling?  `00:00`

- `00:04` 拿起話筒、撥號、對方響鈴，接著通話，最後掛斷。  
  Lift the handset, dial, the far end rings, you talk, and finally hang up.
- `00:10` 除了聲音，線路還得傳遞這些控制訊息，也就是信令 Signaling。  
  Besides the voice, the line must carry these control messages. That is signaling.
- `00:16` 在數位中繼線上，信令主要有兩種：隨路信令 CAS 與共路信令 CCS。  
  On digital trunks there are two main kinds: Channel Associated Signaling (CAS) and Common Channel Signaling (CCS).
- `00:23` 差別在於：信令是跟著每個語音通道走，還是集中在一條專用通道。  
  The difference: does signaling ride with each voice channel, or gather on one dedicated channel?

## 02. T1 與 E1 的骨架 — T1 & E1 Framing  `00:30`

- `00:32` 先認識載體：T1 有 24 個時槽，每個 DS0 是 64 kbps。  
  First, the carrier: a T1 has 24 timeslots, each a 64 kbps DS0.
- `00:39` 一個訊框有 193 位元，每秒 8000 個訊框，總速率 1.544 Mbps。  
  A frame is 193 bits, 8,000 frames per second, for 1.544 Mbps in total.
- `00:46` 多出來的那 1 個位元，是做訊框同步用的 framing bit。  
  The one extra bit is the framing bit, used for frame synchronization.
- `00:51` E1 則有 32 個時槽，總速率 2.048 Mbps。  
  An E1 has 32 timeslots, for 2.048 Mbps in total.
- `00:57` 時槽 0 負責訊框同步，時槽 16 通常保留給信令。  
  Timeslot 0 handles frame alignment; timeslot 16 is usually reserved for signaling.
- `01:02` 所以一條 E1，一般可以承載 30 路語音。  
  So an E1 typically carries 30 voice channels.

## 03. CAS 隨路信令 — CAS: Channel Associated Signaling  `01:06`

- `01:08` CAS 的意思是：信令跟著每一個語音通道走。  
  CAS means signaling travels with each individual voice channel.
- `01:12` 每一路都有自己的狀態位元，用來表示摘機或掛機。  
  Every channel has its own state bits, indicating off-hook or on-hook.
- `01:18` 常見的線路信令有 Loop Start、Ground Start，以及 E&M。  
  Common line signaling types are Loop Start, Ground Start, and E&M.
- `01:23` E&M 又分成 Immediate、Wink、Delay Dial 等啟動方式。  
  E&M has start modes such as Immediate, Wink, and Delay Dial.
- `01:28` 以 Wink Start 為例：一端先佔用線路，  
  Take Wink Start: one side seizes the line first,
- `01:32` 對端回一個短暫的 wink，才開始送出號碼。  
  the far end answers with a brief wink, and only then are digits sent.
- `01:36` 號碼本身，通常用 DTMF 或 MF 音頻，在語音通道內傳送。  
  The digits themselves are usually sent in-band, as DTMF or MF tones.

## 04. T1 的位元竊取 — T1 Robbed-Bit Signaling  `01:43`

- `01:45` 那 T1 的狀態位元放在哪裡？答案是：借來的。  
  So where do T1 state bits live? The answer: they are borrowed.
- `01:50` 在 SF 超訊框的第 6 與第 12 個訊框，  
  In the SF superframe, in frames 6 and 12,
- `01:54` 每個時槽的最低位元，會被拿去當 A、B 信令位元。  
  the least significant bit of every timeslot becomes the A and B signaling bits.
- `01:59` ESF 則在第 6、12、18、24 個訊框，提供 A、B、C、D 四個位元。  
  ESF uses frames 6, 12, 18, and 24, providing four bits: A, B, C, and D.
- `02:06` 這就是 Robbed-Bit Signaling，位元竊取。  
  This is called robbed-bit signaling.
- `02:10` 對語音幾乎聽不出差別，但資料傳輸只能安全使用 56 kbps。  
  Voice barely notices, but data can only safely use 56 kbps.

## 05. E1 CAS 與 R2 — E1 CAS & R2  `02:17`

- `02:19` E1 的 CAS 不偷位元，而是把信令放在時槽 16。  
  E1 CAS doesn't rob bits; it places signaling in timeslot 16.
- `02:24` 16 個訊框組成一個多訊框，第 0 個訊框負責多訊框同步。  
  Sixteen frames form a multiframe; frame 0 carries the multiframe alignment.
- `02:30` 其餘 15 個訊框，每個帶兩路的 ABCD 位元，剛好涵蓋 30 路。  
  Each of the other 15 frames carries ABCD bits for two channels, covering all 30.
- `02:37` 雖然位置集中，但每組位元固定對應某一路，所以仍然是 CAS。  
  Though grouped together, each bit group maps to a fixed channel, so it is still CAS.
- `02:43` 常見的 MFC-R2，就是用這些位元做線路信令，  
  The widely used MFC-R2 uses these bits for line signaling,
- `02:48` 再用語音通道內的多頻互控音，傳遞號碼。  
  and compelled multi-frequency tones inside the voice channel to pass the digits.

## 06. CCS 共路信令 — CCS: Common Channel Signaling  `02:53`

- `02:55` CCS 換了一個思路：把所有通道的信令，集中在一條專用通道。  
  CCS takes another approach: signaling for all channels goes on one dedicated channel.
- `03:01` 信令不再只是幾個位元，而是有結構的訊息。  
  Signaling is no longer just a few bits, but structured messages.
- `03:06` 在企業常見的 ISDN PRI 裡，這條通道叫做 D 通道。  
  In ISDN PRI, common in enterprises, this channel is called the D channel.
- `03:11` T1 PRI 是 23B+D，D 通道在時槽 24。  
  T1 PRI is 23B+D, with the D channel on timeslot 24.
- `03:17` E1 PRI 是 30B+D，D 通道在時槽 16。  
  E1 PRI is 30B+D, with the D channel on timeslot 16.
- `03:22` 電信業者之間，則使用另一套 CCS：七號信令 SS7。  
  Between carriers, another CCS system is used: Signaling System No. 7, or SS7.
- `03:28` 對網路工程師來說，這很像 SIP 與 RTP：信令和媒體分開走。  
  For network engineers, it is much like SIP and RTP: signaling and media travel separately.

## 07. Q.931 通話流程 — Q.931 Call Flow  `03:35`

- `03:36` D 通道的第二層是 Q.921，也就是 LAPD；第三層是 Q.931。  
  The D channel runs Q.921, also known as LAPD, at Layer 2, and Q.931 at Layer 3.
- `03:43` 發話端送出 SETUP，帶著被叫號碼與要使用的 B 通道。  
  The calling side sends SETUP, carrying the called number and the B channel to use.
- `03:49` 對端回 CALL PROCEEDING，接著用 ALERTING 表示正在響鈴。  
  The far end replies CALL PROCEEDING, then ALERTING while the phone rings.
- `03:54` 對方接聽時送出 CONNECT，再以 CONNECT ACK 確認。  
  When answered, it sends CONNECT, confirmed with CONNECT ACK.
- `03:58` 掛斷則依序是 DISCONNECT、RELEASE、RELEASE COMPLETE。  
  Hang-up follows DISCONNECT, RELEASE, then RELEASE COMPLETE.
- `04:03` 拆線訊息都帶有 Cause Code，排錯時非常好用。  
  Clearing messages carry a cause code, which is very handy for troubleshooting.

## 08. CAS 與 CCS 比較 — CAS vs. CCS  `04:08`

- `04:10` 把兩者並排比較一下。  
  Let's compare the two side by side.
- `04:12` CAS 簡單、相容老設備，但能傳遞的資訊有限。  
  CAS is simple and compatible with legacy equipment, but carries limited information.
- `04:18` CCS 能傳送來電號碼、失敗原因等豐富資訊，  
  CCS can carry rich information such as calling number and failure cause,
- `04:23` 而且每個 B 通道都保有完整的 64 kbps。  
  and every B channel keeps the full, clear 64 kbps.
- `04:27` 代價是 T1 PRI 要讓出一個時槽給 D 通道，只剩 23 路。  
  The trade-off: T1 PRI gives one timeslot to the D channel, leaving 23 bearers.
- `04:33` 不過透過 NFAS，一條 D 通道可以控制多條 T1。  
  But with NFAS, a single D channel can control multiple T1s.

## 09. 設定實戰：CAS — Hands-on: Configuring CAS  `04:39`

- `04:40` 動手設定前，先跟電信業者或對端確認參數。  
  Before configuring, confirm the parameters with the carrier or the far end.
- `04:45` T1 要確認訊框是 SF 還是 ESF，線路編碼是 AMI 還是 B8ZS。  
  For T1: framing SF or ESF, and line coding AMI or B8ZS.
- `04:53` E1 要確認是否啟用 CRC4，線路編碼通常是 HDB3。  
  For E1: whether CRC4 is enabled; line coding is usually HDB3.
- `04:59` 時脈來源通常設為 line，跟隨電信端。  
  Clock source is usually set to line, following the carrier.
- `05:03` 以 Cisco IOS 為例，CAS 用 ds0-group 指定時槽與信令類型。  
  In Cisco IOS, CAS uses ds0-group to set the timeslots and signaling type.
- `05:10` 系統會產生對應的 voice-port，再用 dial-peer 指向它。  
  This creates a matching voice-port, and a dial-peer then points to it.

## 10. 設定實戰：PRI 與驗證 — Hands-on: PRI & Verification  `05:15`

- `05:17` 如果是 PRI，先設定 ISDN switch-type，要與對端一致。  
  For PRI, first set the ISDN switch-type to match the far end.
- `05:22` 在 controller 底下，用 pri-group 指定時槽。  
  Under the controller, use pri-group to specify the timeslots.
- `05:26` T1 會產生 Serial 介面 :23，E1 則是 :15，代表 D 通道。  
  T1 creates a Serial interface ending in :23, E1 one ending in :15; it represents the D channel.
- `05:33` 用 show isdn status 驗證，第二層應顯示 MULTIPLE_FRAME_ESTABLISHED。  
  Verify with show isdn status; Layer 2 should show MULTIPLE_FRAME_ESTABLISHED.
- `05:39` 如果出現 slips，多半是兩端時脈來源設定不一致。  
  If you see slips, the clock sources on the two ends are most likely mismatched.
- `05:44` CAS 可用 debug vpm signal 觀察位元；PRI 則用 debug isdn q931。  
  For CAS, debug vpm signal shows the bits; for PRI, use debug isdn q931.
- `05:52` 記住：CAS 信令跟著通道走，CCS 信令集中在專用通道。  
  Remember: CAS signaling rides each channel; CCS gathers it on a dedicated channel.
- `05:58` 兩端參數對齊，就是穩定上線的第一步。謝謝收看！  
  Matching parameters on both ends is the first step to a stable link. Thanks for watching!

## 角色 Characters

- **小話機 Phone** — 使用者端點（FXS 端） / User endpoint (FXS side)：會摘機、掛機、撥號的電話。它的每個動作，都要變成信令送出去。 / Goes off-hook, on-hook and dials. Every action it takes must become signaling.
- **阿交 PBX** — 企業交換機 / Private branch exchange：企業內的交換機，透過 T1/E1 中繼線和電信局或語音閘道連接。 / The enterprise switch, connected to the carrier or a voice gateway over T1/E1 trunks.
- **電信局 Central Office** — 電信業者交換機 / Carrier switch：提供中繼線與時脈的一端，參數要以它為準。 / Provides the trunk and usually the clock. Match your parameters to it.
- **時槽列車 Timeslot Train** — DS0 時槽 / DS0 timeslots：每節車廂是一個 64 kbps 的 DS0，T1 有 24 節，E1 有 32 節。 / Each car is a 64 kbps DS0. A T1 has 24 cars, an E1 has 32.
- **位元小偷 Bit Thief** — T1 位元竊取信令 / T1 robbed-bit signaling：在特定訊框借走每個時槽的最低位元，拿來當 A/B/C/D 信令位元。 / Borrows the least significant bit of every timeslot in certain frames to use as A/B/C/D bits.
- **D 通道信差 D-Channel Courier** — ISDN PRI 的信令通道 / ISDN PRI signaling channel：專門搬運 Q.931 訊息，一個人負責所有 B 通道的建立與拆線。 / Carries Q.931 messages and handles setup and teardown for every B channel.
- **語音閘道 Voice Gateway** — Cisco IOS 路由器 / Cisco IOS router：裝有 T1/E1 模組的路由器，用 controller、voice-port 與 dial-peer 完成設定。 / A router with a T1/E1 module, configured with controller, voice-port and dial-peer.
