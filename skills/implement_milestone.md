# Skill: Implement Next Milestone

**Objective:** Autonomously implement the next pending milestone for the Highland Cal project, open a Pull Request, and update the project tracking state.

## Execution Steps:
1. **Preparation:** Fetch the latest changes from the remote (git fetch upstream) and start the milestone on a fresh branch based on the main branch (git checkout -b milestone-x-name upstream/main).
2. **Read State:** View the `docs/STATUS.md` file to identify the `Current Milestone`.
3. **Read Spec:** View the `docs/Roadmap.md` file and navigate to the section for the `Current Milestone`.
4. **Plan:** Read all the tasks for that milestone. Create an Implementation Plan and wait for user approval.
5. **Implement:** Execute the implementation plan. 
6. **Verify:** Ensure the codebase runs locally and passes linting/type-checking (if configured).
7. **Update Progress:** 
   - Edit `docs/Roadmap.md` to check off the completed `[x]` tasks for this milestone.
   - Edit docs/STATUS.md to update Last Completed and increment the Current Milestone to the next logical phase (or mark as Completed).
8. **Create PR:** Commit your changes, push the branch, and open a Pull Request.
9. **Review & Iterate:** Wait for `gemini-code-assist` to comment on the PR (wait no more than 5 minutes). Address all reported errors and review feedback in the codebase.
10. **Resolve Comments:** Once you have pushed the fixes for the feedback, explicitly resolve the `gemini-code-assist` review threads on the PR via GitHub.
11. **Ensure CI Passes:** Keep fixing code and updating the PR until all CI checks pass successfully.
