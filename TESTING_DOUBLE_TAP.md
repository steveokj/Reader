# Double-Tap Testing Guide

## Test Pages

### 1. Gesture Test Page
Navigate to: `http://192.168.2.34:3002/gesture-test` on your mobile device

This page provides:
- **Event logging**: See every tap event with timestamps and details
- **Double-tap detection feedback**: Visual confirmation when double-tap works
- **Selection testing**: Button to check if text selection works
- **Real-time status**: Shows what's happening as you tap

**How to use:**
1. Open the page on your phone
2. Tap once on the test area - you should see a TAP event in the log
3. Tap again quickly in the same spot - you should see:
   - A DOUBLE-TAP event in the log
   - A modal dialog appear
   - The event count increment
4. Check the event log to see timing between events

### 2. Real Reader Page (Books)
Navigate to: `http://192.168.2.34:3002/books/2` on your mobile device

**Testing steps:**
1. Open the browser's developer console on mobile:
   - **Chrome Android**: Menu → More Tools → Developer Tools
   - **Safari iOS**: Settings → Safari → Advanced → Web Inspector
   
2. Double-tap on a word in the book text
3. Check the console for debug messages:
   ```
   [double-tap] count=2 detected
   [double-tap] banner { word: "...", ... }
   [double-tap] selection check { isSingleWordTap: true, ... }
   [double-tap] added range to selection
   [double-tap] finalizeRange called
   ```

## What to Look For

### ✅ Expected Behavior:
1. **First double-tap on a word:**
   - Word gets highlighted (blue background)
   - Action menu appears above the word
   - Console shows: `isSingleWordTap: true, willSelect: true`
   - Only ONE banner appears

2. **Second double-tap on different word:**
   - Both words get highlighted
   - Action menu updates
   - Console shows multi-word selection
   - Two banners appear (max 3 shown)

### Key Console Logs to Check:

When you double-tap a word, you should see in order:
```
[long-press] started { x, y, pointerId }
[tap-point] received { source, tapEligible: true }
[tap-sequence] called { tapEligible: true, currentTapCount: 1 }
[tap-point] received (second tap)
[tap-sequence] called { currentTapCount: 2 }
[double-tap] count=2 detected
[double-tap] banner { banner: {word: "..."}, wordRangeText: "..." }
[double-tap] selection check { isSingleWordTap: true, willSelect: true }
[double-tap] selection set { selectedText: "...", rangeCount: 1 }
[double-tap] finalizeRange called with text: "..."
```

### ❌ Problems to Report:

1. **Double banner for same word:**
   - Look for duplicate `[double-tap] banner` logs with same timestamp
   - Check if `resetTapState` is called

2. **Wrong word in banner:**
   - Check the console log: `[double-tap] banner`
   - Compare `banner.word` with `wordRangeText`
   - They should match

3. **No text selection:**
   - Console shows: `willSelect: false`
   - Check values of: `hasWordRange`, `isSingleWordTap`
   - Look for: `selection set` log - if missing, selection wasn't added

4. **Text selected but no action menu:**
   - Console shows: `selection set` with `rangeCount: 1`
   - But no `finalizeRange called` message
   - Or shows: `no range in selection when trying to finalize`

5. **tapEligible is false:**
   - Console shows: `[tap-point] not eligible for tap sequence`
   - Or: `[tap-sequence] BLOCKED - tapEligible is false`
   - This means long-press didn't fire or was cancelled

## Console Commands to Run

Open console and paste these to check state:

```javascript
// Check if selection exists
window.getSelection().toString()

// Check selection range count
window.getSelection().rangeCount

// Force clear selection
window.getSelection().removeAllRanges()
```

## Remote Debugging

### Chrome (Android):
1. Connect phone via USB
2. Enable USB debugging on phone
3. Open Chrome on PC: `chrome://inspect`
4. Click "inspect" next to your device
5. See full console output on PC

### Safari (iOS):
1. Connect iPhone via USB
2. On iPhone: Settings → Safari → Advanced → Web Inspector ON
3. On Mac: Safari → Develop → [Your iPhone] → [Page]
4. See full console on Mac

## Report Back

Please share:
1. Screenshot of the event log from gesture-test page
2. Console output from the books page
3. Description of what you see vs what you expect
4. Device model and browser version

