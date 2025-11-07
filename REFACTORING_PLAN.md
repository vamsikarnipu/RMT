# Code Refactoring Plan - Modularization

## ✅ Schema Bug Fixed
- **Issue**: `doj` and `lwd` in Employee entity were declared as `String` but should be `Date`
- **Fixed**: Changed both fields to `Date` type

## Functions to Move from Home.controller.js to CustomUtility.js

### Business Logic Functions (Submit/Cancel)
1. `onSubmitCustomer` - Customer form submission
2. `onSubmitEmployee` - Employee form submission  
3. `onSubmitOpportunity` - Opportunity form submission
4. `onSubmitProject` - Project form submission
5. `onCancelForm` - Customer form cancel
6. `onCancelEmployeeForm` - Employee form cancel
7. `onCancelOpportunityForm` - Opportunity form cancel
8. `onCancelProjectForm` - Project form cancel

### Utility Functions
9. `_hardRefreshTable` - Refresh table after CRUD operations
10. `_initializeCustomerIdField` - Initialize Customer ID preview
11. `_initializeOpportunityIdField` - Initialize Opportunity ID preview
12. `_initializeProjectIdField` - Initialize Project ID preview
13. `_populateCountryDropdown` - Populate country dropdown
14. `_resetAllTablesToShowLess` - Reset table display state
15. `_resetAllSegmentedButtons` - Reset segmented buttons
16. `_resetSegmentedButtonForFragment` - Reset button for specific fragment
17. `_createCustomerDirect` - Direct customer creation (fallback)
18. `_generateNextIdFromBinding` - Generate next ID from binding (if exists)

### Search Functions
19. `onCustomerSearch` - Customer table search
20. `onEmployeeSearch` - Employee table search
21. `onOpportunitySearch` - Opportunity table search
22. `onProjectSearch` - Project table search

### Form Handlers
23. `onCountryChange` - Country dropdown change handler
24. `onBandChange` - Band dropdown change handler

## Functions to KEEP in Home.controller.js (Navigation/Routing)

1. `onInit` - Controller initialization (navigation setup)
2. `onSideNavButtonPress` - Side navigation toggle
3. `onItemSelect` - Main navigation handler (routes to pages)
4. `_loadFragmentIfNeeded` - Fragment loading logic (navigation-specific)
5. `_clearPreviousTableEditState` - Navigation guard (check unsaved changes)
6. `_saveCurrentTableChanges` - Navigation helper (save before navigate)
7. `_cancelCurrentTableChanges` - Navigation helper (cancel before navigate)
8. `_discardTableEditState` - Navigation helper (discard state)
9. `onAllocationViewChange` - Allocation page navigation
10. `onAllocationSearch` - Allocation page search
11. `onDemandPress` - Navigation to demands
12. `onBackToProjectsPress` - Navigation back to projects
13. `onResourcesPress` - Resources navigation
14. `onAllocateRes` - Allocation dialog
15. `onAllocateConfirm` - Allocation confirmation
16. `onDialogClose` - Dialog close handler
17. `onResSearch` - Res fragment search
18. `onDemandSearch` - Demand fragment search
19. `onResCustomerChange` - Res fragment value help
20. `onResOpportunityChange` - Res fragment value help
21. `onResProjectChange` - Res fragment value help
22. `onResOpportunityValueHelpRequest` - Value help request
23. `onResProjectValueHelpRequest` - Value help request
24. `onResDemandValueHelpRequest` - Value help request

## Backend Schema Analysis

### ✅ Entity Relationships - All Correct
- Customer ↔ Opportunity: ✅ Correct (one-to-many)
- Opportunity ↔ Project: ✅ Correct (one-to-many)
- Project ↔ Demand: ✅ Correct (one-to-many)
- Project ↔ EmployeeProjectAllocation: ✅ Correct (one-to-many)
- Employee ↔ EmployeeProjectAllocation: ✅ Correct (one-to-many)
- Employee ↔ EmployeeSkill: ✅ Correct (one-to-many via junction)
- Skills ↔ EmployeeSkill: ✅ Correct (one-to-many via junction)
- Skills ↔ Demand: ✅ Correct (one-to-many)
- Employee ↔ Employee (Supervisor): ✅ Correct (self-reference)

### ✅ Fixed Issues
- Employee.doj: Changed from String to Date ✅
- Employee.lwd: Changed from String to Date ✅

### ✅ No Bugs Found
All entity relationships are properly defined with correct cardinalities.

