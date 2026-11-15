# Test Plan

Nothing below has been run. Fill in Result (Pass / Fail) and Notes with your own observations.
Use two Chrome profiles: one instructor (dashboard) and one student (extension), and a test Google Form.

| # | Test | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| 1 | Instructor authentication | Add email to allowlist, create account, sign in | Dashboard opens; wrong password is rejected | Not tested | |
| 2 | Student authentication | Create account with a non-allowlisted email; sign in at the extension popup | Popup shows session list; dashboard shows "Instructor access required" | Not tested | |
| 3 | Session creation | Create a session starting now, 30 minutes | Appears in the table; code shown once | Not tested | |
| 4 | Google Forms URL registration | Try a non-Forms URL, then a valid one | Invalid rejected; valid accepted | Not tested | |
| 5 | Session code validation | Join with a wrong code, then the right code | Wrong rejected by server; right opens the form | Not tested | |
| 6 | Extension installation | Load unpacked in chrome://extensions | No manifest errors; popup opens | Not tested | |
| 7 | Google Forms page detection | Start monitoring; open the form | Popup shows Monitoring active; unrelated sites produce no events | Not tested | |
| 8 | Tab switching | Switch to another tab and back; open a new tab | tab_switched_away, tab_returned, new_tab_opened logged | Not tested | |
| 9 | Window focus | Click another application, then return | window_blur and window_focus logged | Not tested | |
| 10 | Copy/paste | Copy and paste inside the form page | copy and paste events logged; no content stored | Not tested | |
| 11 | Fullscreen exit | On the form tab, open DevTools and run `document.documentElement.requestFullscreen()`, then press Esc | fullscreen_exit logged | Not tested | |
| 12 | Inactivity | Idle longer than the threshold, then move the mouse | inactivity event with duration logged | Not tested | |
| 13 | Log submission | Trigger events; check popup pending count | Pending count returns to 0; offline events upload after reconnect | Not tested | |
| 14 | Database storage | Table Editor > activity_logs | Rows exist with correct student, session, type | Not tested | |
| 15 | Dashboard display | Open Dashboard, session detail, Activity Logs | Counts, tables and filters match the data | Not tested | |
| 16 | Review function | Set status and notes on an event; reload | Saved review persists | Not tested | |
| 17 | Unauthorized access | Student not assigned tries to join; call log-events with another student's session; student tries to read another session | All rejected (403 or no rows) | Not tested | |

Note on test 11: F11 browser fullscreen does not fire the page `fullscreenchange` event, so it is not
detected. Only fullscreen entered through the page's Fullscreen API is.
