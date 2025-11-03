# Navigation Transition Fix - Save/Cancel/Stay Functionality

This document contains all the code changes related to implementing the navigation confirmation dialog with Save/Cancel/Stay options when navigating between fragments with unsaved changes.

## 📋 Table of Contents
1. [Overview](#overview)
2. [Home.controller.js Changes](#homecontrollerjs-changes)
3. [CustomUtility.js Changes](#customutilityjs-changes)
4. [Key Features](#key-features)
5. [Important Notes](#important-notes)

---

## Overview

When a user has unsaved changes in a table and tries to navigate to another fragment, a confirmation dialog appears with three options:
- **Save**: Saves all pending changes, then navigates
- **Cancel**: Discards all pending changes, then navigates
- **Stay**: Stays on current fragment (prevents navigation)

---

## Home.controller.js Changes

### 1. Navigation Check Method (`_clearPreviousTableEditState`)

Add this method to check for unsaved changes before navigation:

```javascript
// ✅ NEW: Check for unsaved changes before navigating
_clearPreviousTableEditState: function (sNewPageKey) {
    const oEditModel = this.getView().getModel("edit");
    if (!oEditModel) {
        return Promise.resolve(true); // No edit model, allow navigation
    }

    // Map of page keys to table IDs
    const pageToTableMap = {
        customers: "Customers",
        opportunities: "Opportunities",
        projects: "Projects",
        employees: "Employees",
        // ✅ REMOVED: verticals: "Verticals", (Vertical is now an enum)
        sapid: "SAPIdStatuses"
    };

    const sCurrentTable = oEditModel.getProperty("/currentTable");
    if (!sCurrentTable) {
        return Promise.resolve(true); // No table in edit mode, allow navigation
    }

    // If navigating to a different table (or home), check for unsaved changes
    const sNewTableId = pageToTableMap[sNewPageKey];
    if (sCurrentTable === sNewTableId) {
        return Promise.resolve(true); // Same table, allow navigation
    }

    // Get the edit state for the current table
    const sPrevEditingPath = oEditModel.getProperty(`/${sCurrentTable}/editingPath`);
    const sPrevMode = oEditModel.getProperty(`/${sCurrentTable}/mode`);

    if (!sPrevEditingPath || sPrevEditingPath.length === 0) {
        return Promise.resolve(true); // No unsaved changes, allow navigation
    }

    // ✅ Show confirmation dialog with Save, Cancel, and Stay options
    return new Promise((resolve) => {
        // ✅ FIXED: Use custom action strings to ensure button text displays correctly
        const SAVE_ACTION = "Save";
        const CANCEL_ACTION = "Cancel";
        const STAY_ACTION = "Stay";
        
        sap.m.MessageBox.show(
            `You have unsaved changes in ${sCurrentTable}. What would you like to do?`,
            {
                icon: sap.m.MessageBox.Icon.WARNING,
                title: "Unsaved Changes",
                actions: [
                    SAVE_ACTION,
                    CANCEL_ACTION,
                    STAY_ACTION
                ],
                emphasizedAction: SAVE_ACTION,
                onClose: (sAction) => {
                    if (sAction === STAY_ACTION) {
                        // Stay on current fragment - prevent navigation
                        resolve(false);
                        return;
                    }

                    if (sAction === SAVE_ACTION) {
                        // Save changes first, then navigate
                        this._saveCurrentTableChanges(sCurrentTable).then(() => {
                            this._discardTableEditState(sCurrentTable);
                            resolve(true); // Allow navigation after save
                        }).catch((err) => {
                            console.error("[Navigation] Error saving changes:", err);
                            sap.m.MessageBox.error("Error saving changes. Please try again.");
                            resolve(false); // Prevent navigation on error
                        });
                    } else if (sAction === CANCEL_ACTION) {
                        // Discard changes and navigate
                        // ✅ FIXED: Call the actual cancel logic from CustomUtility to properly cancel OData changes
                        this._cancelCurrentTableChanges(sCurrentTable).then(() => {
                            this._discardTableEditState(sCurrentTable);
                            resolve(true); // Allow navigation after discard
                        }).catch((err) => {
                            console.error("[Navigation] Error canceling changes:", err);
                            // Even if cancel fails, clear edit state and allow navigation
                            this._discardTableEditState(sCurrentTable);
                            resolve(true);
                        });
                    }
                }
            }
        );
    });
},
```

### 2. Save Changes Method (`_saveCurrentTableChanges`)

Add this method to save changes for a specific table:

```javascript
// ✅ NEW: Save changes for a specific table
_saveCurrentTableChanges: async function (sTableId) {
    // Reuse the save logic from CustomUtility
    const buttonMap = {
        "Customers": { save: "saveButton" },
        "Employees": { save: "saveButton_emp" },
        "Opportunities": { save: "saveButton_oppr" },
        "Projects": { save: "saveButton_proj" },
        "SAPIdStatuses": { save: "saveButton_sap" }
    };

    // Create a mock event object to trigger save
    const oMockEvent = {
        getSource: () => {
            const sButtonId = buttonMap[sTableId]?.save;
            return {
                getId: () => `mock--${sButtonId}`
            };
        }
    };

    // Call the save function
    await CustomUtility.prototype.onSaveButtonPress.call(this, oMockEvent);
},
```

### 3. Cancel Changes Method (`_cancelCurrentTableChanges`)

Add this method to cancel changes for a specific table:

```javascript
// ✅ NEW: Cancel changes for a specific table (for navigation dialog)
// This bypasses the confirmation dialog since user already confirmed in navigation dialog
_cancelCurrentTableChanges: function (sTableId) {
    // Call the internal cancel operation directly (without confirmation dialog)
    // CustomUtility has a method that performs the actual cancel logic
    return new Promise((resolve) => {
        try {
            // Call the internal cancel operation from CustomUtility
            // We pass a flag to skip the confirmation dialog
            CustomUtility.prototype._performCancelOperation.call(this, sTableId, true); // true = skip confirmation
            
            // Give it a moment to complete, then resolve
            setTimeout(() => {
                resolve();
            }, 100);
        } catch (error) {
            console.error("[Navigation] Error canceling changes:", error);
            resolve(); // Still allow navigation even if cancel fails
        }
    });
},
```

### 4. Discard Edit State Method (`_discardTableEditState`)

Add this method to clear edit state:

```javascript
// ✅ NEW: Discard edit state for a specific table
_discardTableEditState: function (sTableId) {
    const oEditModel = this.getView().getModel("edit");
    if (!oEditModel) return;

    const oPrevTable = this.byId(sTableId);
    if (!oPrevTable) return;

    const sPrevEditingPath = oEditModel.getProperty(`/${sTableId}/editingPath`);
    if (!sPrevEditingPath || sPrevEditingPath.length === 0) return;

    // Reset edit state
    oEditModel.setProperty(`/${sTableId}/editingPath`, "");
    oEditModel.setProperty(`/${sTableId}/mode`, null);
    oEditModel.setProperty("/currentTable", null);

    // Disable Save/Cancel buttons
    const buttonMap = {
        "Customers": { save: "saveButton", cancel: "cancelButton", edit: "btnEdit_cus", delete: "btnDelete_cus", add: "btnAdd" },
        "Employees": { save: "saveButton_emp", cancel: "cancelButton_emp", edit: "Edit_emp", delete: "Delete_emp", add: "btnAdd_emp" },
        "Opportunities": { save: "saveButton_oppr", cancel: "cancelButton_oppr", edit: "btnEdit_oppr", delete: "btnDelete_oppr", add: "btnAdd_oppr" },
        "Projects": { save: "saveButton_proj", cancel: "cancelButton_proj", edit: "btnEdit_proj", delete: "btnDelete_proj", add: "btnAdd_proj" },
        "SAPIdStatuses": { save: "saveButton_sap", cancel: "cancelButton_sap", edit: "btnEdit_sap", delete: "btnDelete_sap", add: "btnAdd_sap" }
    };

    const config = buttonMap[sTableId];
    if (config) {
        this.byId(config.save)?.setEnabled(false);
        this.byId(config.cancel)?.setEnabled(false);
        this.byId(config.edit)?.setEnabled(false);
        this.byId(config.delete)?.setEnabled(false);
        this.byId(config.add)?.setEnabled(true);
    }

    // Discard pending changes
    try {
        const oModel = this.getView().getModel();
        if (oModel) {
            const aPaths = sPrevEditingPath.split(",").filter(Boolean);
            aPaths.forEach(sPath => {
                try {
                    const oContext = CustomUtility.prototype._resolveContextByPath.call(this, oPrevTable, sPath);
                    if (oContext) {
                        // Reset context changes
                        if (oContext.reset) {
                            oContext.reset();
                        } else if (oContext.getObject) {
                            const oData = oContext.getObject();
                            if (oData._originalData) {
                                // Restore original data
                                const oOriginal = oData._originalData;
                                Object.keys(oOriginal).forEach(sKey => {
                                    if (sKey !== '_originalData' && sKey !== 'isEditable' && sKey !== '_hasChanged') {
                                        oContext.setProperty(sKey, oOriginal[sKey]);
                                    }
                                });
                                delete oData._originalData;
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Navigation] Could not reset context ${sPath}:`, e);
                }
            });
        }
    } catch (e) {
        console.warn("[Navigation] Error discarding pending changes:", e);
    }
},
```

### 5. Update Navigation Handler (`onItemSelect`)

Modify your existing `onItemSelect` method to call the check:

```javascript
onItemSelect: function (oEvent) {
    const sKey = oEvent.getParameter("key");
    const pageMap = {
        home: "root1",
        customers: "customersPage",
        opportunities: "opportunitiesPage",
        projects: "projectsPage",
        sapid: "sapidPage",
        employees: "employeesPage",
        overview: "overviewPage",
        requirements: "requirementsPage",
        bench: "benchPage",
        pendingProjects: "pendingProjectsPage",
        pendingOpportunities: "pendingOpportunitiesPage"
    };

    const sPageId = pageMap[sKey];

    if (!sPageId) {
        return;
    }

    // ✅ FIXED: Check for unsaved changes before navigating
    this._clearPreviousTableEditState(sKey).then((bAllowNavigation) => {
        if (!bAllowNavigation) {
            // User chose "Stay" - don't navigate
            return;
        }
        
        // Reset all tables to "show-less" state before navigating
        this._resetAllTablesToShowLess();
        oNavContainer.to(this.byId(sPageId));
        
        // Continue with fragment loading logic...
        this._loadFragmentIfNeeded(sKey, sPageId);
    });
},
```

---

## CustomUtility.js Changes

### 1. Internal Cancel Operation Method (`_performCancelOperation`)

Add this NEW method to `CustomUtility.js` - this contains the actual cancel logic:

```javascript
// ✅ NEW: Internal method to perform the actual cancel operation (can skip confirmation)
_performCancelOperation: function (sTableId, bSkipConfirmation) {
    const self = this; // Store reference to this

    // Button mapping for all tables
    const buttonMap = {
        "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
        "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
        "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
        "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
        "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
    };

    // Execute cancel logic directly (without confirmation dialog)
    console.log("=== [Controller] Starting cancel operation ===");

    const oTable = self.byId(sTableId);
    const oView = self.getView();
    const oModel = oView.getModel(); // OData V4 model
    const oEditModel = oView.getModel("edit");
    // ✅ FIXED: Get edit state for THIS specific table only
    const sPath = oEditModel.getProperty(`/${sTableId}/editingPath`) || "";
    const sMode = oEditModel.getProperty(`/${sTableId}/mode`);

    console.log("Current editing path:", sPath);
    console.log("Edit mode:", sMode);
    console.log("Table ID:", sTableId);

    if (!sPath) {
        sap.m.MessageToast.show("No row is in edit mode.");
        return;
    }

    // ✅ FIXED: Cancel only SELECTED rows, not all rows in editingPath
    let aContextsToCancel = [];
    const aSelectedContexts = oTable.getSelectedContexts();

    // ✅ Always prioritize selected rows - if user selected specific rows, only cancel those
    if (aSelectedContexts && aSelectedContexts.length > 0) {
        // User has selected specific rows - only cancel those
        aContextsToCancel = aSelectedContexts.filter(ctx => {
            // Only include contexts that are in the editingPath
            const sCtxPath = ctx.getPath();
            if (sMode === "add-multi" || sMode === "multi-edit") {
                return sPath.includes(sCtxPath);
            }
            return sPath === sCtxPath || sPath.includes(sCtxPath);
        });
        console.log(`=== [SELECTIVE-CANCEL] Canceling ${aContextsToCancel.length} selected rows out of ${aSelectedContexts.length} selected ===`);
    } else if ((sMode === "multi-edit" || sMode === "add-multi") && sPath.includes(",")) {
        // No selection, but multiple rows in edit mode - cancel ALL of them
        // (This is the "cancel all" behavior)
        const aPaths = sPath.split(",").filter(Boolean);
        aContextsToCancel = aPaths.map(p => self._resolveContextByPath(oTable, p)).filter(Boolean);
        console.log(`=== [MULTI-CANCEL] Canceling ${aContextsToCancel.length} rows (no selection, canceling all) ===`);
    } else {
        // Single row editing: resolve the specific context reliably
        let oContext = self._resolveContextByPath(oTable, sPath);
        if (!oContext) {
            // Try to get from selection as fallback
            const aFallbackSelected = oTable.getSelectedContexts();
            oContext = aFallbackSelected && aFallbackSelected.find(ctx => ctx.getPath() === sPath) || aFallbackSelected && aFallbackSelected[0];
        }
        if (!oContext) {
            sap.m.MessageToast.show("Unable to find edited context.");
            return;
        }
        aContextsToCancel = [oContext];
        console.log(`=== [SINGLE-CANCEL] Canceling 1 row ===`);
    }

    if (aContextsToCancel.length === 0) {
        sap.m.MessageToast.show("No rows selected to cancel. Please select the row(s) you want to cancel.");
        return;
    }

    try {
        // 1. Debug the current state
        console.log("=== [CANCEL] Current Edit State ===");
        console.log("Edit Model:", oEditModel.getData());
        console.log("Editing Path:", sPath);
        console.log("Mode:", sMode);

        // 2. Do not reset all model changes here; cancel is scoped per-context
        //    We only delete the transient context or restore the single edited context below

        // 3. Process ALL contexts to cancel
        aContextsToCancel.forEach((oContext, index) => {
            const sContextPath = oContext.getPath();
            console.log(`[MULTI-CANCEL] Processing row ${index + 1}: ${sContextPath}`);

            try {
                const oData = oContext.getObject();

                // ✅ FIXED: Better detection of truly new unsaved rows
                // A new row that hasn't been saved will have:
                // 1. Path starting with '$' (e.g., '$3') OR
                // 2. _isNew flag set AND it's in "add" mode
                const bIsTemporaryPath = sContextPath && (sContextPath.startsWith('$') || sContextPath.includes('/$'));
                const bIsInAddMode = sMode === "add" || sMode === "add-multi";
                const bIsNewRow = bIsTemporaryPath || (oData._isNew && bIsInAddMode);
                
                // Check if truly transient (only for unsaved new rows)
                let bIsTransient = false;
                if (typeof oContext.isTransient === "function") {
                    bIsTransient = oContext.isTransient();
                }
                
                // ✅ Only delete if it's a truly new unsaved row (not an existing saved row being edited)
                if (bIsNewRow && bIsTransient && bIsInAddMode) {
                    try {
                        oContext.delete();
                        console.log(`[MULTI-CANCEL] Deleted new/transient row ${index + 1}: ${sContextPath}`);
                    } catch (e) {
                        console.log(`[MULTI-CANCEL] Error deleting transient row: ${e.message}`);
                    }
                    return; // Skip to next row
                }

                // ✅ For existing rows (saved or being edited), restore original data
                console.log(`[MULTI-CANCEL] Row ${index + 1} is existing row, restoring original data...`);
                console.log(`[MULTI-CANCEL] Row ${index + 1} original data exists:`, !!oData._originalData);

                if (oData._originalData) {
                    console.log(`[MULTI-CANCEL] Restoring original data for row ${index + 1}...`);
                    const oOriginalData = oData._originalData;

                    // Restore all original properties
                    Object.keys(oOriginalData).forEach(sKey => {
                        if (sKey !== '_originalData' && sKey !== 'isEditable' && sKey !== '_hasChanged' && sKey !== '_isNew') {
                            try {
                                let vValue = oOriginalData[sKey];
                                if (vValue instanceof Date) {
                                    vValue = new Date(vValue.getTime());
                                }
                                oContext.setProperty(sKey, vValue);
                            } catch (propError) {
                                console.warn(`[MULTI-CANCEL] Error restoring property ${sKey}:`, propError);
                            }
                        }
                    });

                    // Clean up the temporary properties
                    delete oData._originalData;
                    delete oData._hasChanged;
                    delete oData.isEditable;
                    // Don't delete _isNew here if it exists (it shouldn't for saved rows)

                    console.log(`[MULTI-CANCEL] Restored original data for row ${index + 1}`);
                } else {
                    // ✅ If no _originalData, this might be a saved row being edited for the first time
                    // In this case, just clear the edit flags but don't delete
                    console.log(`[MULTI-CANCEL] No original data found for row ${index + 1}, clearing edit flags only`);
                    delete oData.isEditable;
                    delete oData._hasChanged;
                    // Don't delete the row - it's an existing saved row
                }
            } catch (contextError) {
                console.error(`[MULTI-CANCEL] Error processing context ${index + 1}:`, contextError);
            }
        });

        // ✅ FIXED: Update editingPath to remove canceled rows, keep others
        const aCanceledPaths = aContextsToCancel.map(ctx => ctx.getPath()).filter(Boolean);
        let sRemainingPath = sPath;
        
        // Remove canceled paths from editingPath
        if (aCanceledPaths.length > 0) {
            const aCurrentPaths = sPath.split(",").filter(Boolean);
            const aRemainingPaths = aCurrentPaths.filter(p => !aCanceledPaths.includes(p));
            
            if (aRemainingPaths.length > 0) {
                // Still have other rows in edit mode
                sRemainingPath = aRemainingPaths.join(",");
                oEditModel.setProperty(`/${sTableId}/editingPath`, sRemainingPath);
                // Keep mode as is (add-multi or multi-edit)
                console.log(`[MULTI-CANCEL] Updated editingPath, remaining rows: ${aRemainingPaths.length}`);
            } else {
                // All rows canceled, clear edit state
                oEditModel.setProperty(`/${sTableId}/editingPath`, "");
                oEditModel.setProperty(`/${sTableId}/mode`, null);
                if (oEditModel.getProperty("/currentTable") === sTableId) {
                    oEditModel.setProperty("/currentTable", null);
                }
                console.log(`[MULTI-CANCEL] All rows canceled, edit state cleared`);
            }
        } else {
            // No canceled paths (shouldn't happen, but handle gracefully)
            oEditModel.setProperty(`/${sTableId}/editingPath`, "");
            oEditModel.setProperty(`/${sTableId}/mode`, null);
            if (oEditModel.getProperty("/currentTable") === sTableId) {
                oEditModel.setProperty("/currentTable", null);
            }
        }

        // 🚨 CRITICAL: Discard pending changes for edited contexts only
        console.log("[MULTI-CANCEL] Discarding pending changes for edited contexts...");
        try {
            const oModel = self.getView().getModel();
            if (oModel && oModel.getPendingChanges) {
                const aPendingChanges = oModel.getPendingChanges();
                console.log("[MULTI-CANCEL] Pending changes found:", aPendingChanges.length);

                // Discard changes for specific contexts
                aContextsToCancel.forEach((oContext, index) => {
                    if (oContext && oContext.getPath) {
                        const sContextPath = oContext.getPath();
                        console.log(`[MULTI-CANCEL] Discarding changes for context ${index + 1}: ${sContextPath}`);

                        // Try to discard changes for this specific context
                        try {
                            if (oContext.reset) {
                                oContext.reset();
                                console.log(`[MULTI-CANCEL] Reset context ${index + 1}`);
                            }
                        } catch (resetError) {
                            console.log(`[MULTI-CANCEL] Context reset failed for ${index + 1}:`, resetError);
                        }
                    }
                });
            }
        } catch (discardError) {
            console.log("[MULTI-CANCEL] Error discarding pending changes:", discardError);
        }

        // 5. Update button states based on remaining rows in edit mode
        const config = buttonMap[sTableId];
        
        // Check if there are still rows in edit mode after canceling
        // ✅ FIXED: Reuse the sRemainingPath variable or read from model directly
        const sRemainingPathAfterCancel = oEditModel.getProperty(`/${sTableId}/editingPath`) || "";
        const bHasRemainingRows = sRemainingPathAfterCancel && sRemainingPathAfterCancel.length > 0;
        
        if (bHasRemainingRows) {
            // Still have rows in edit mode - keep Save/Cancel enabled
            self.byId(config.save)?.setEnabled(true);
            self.byId(config.cancel)?.setEnabled(true);
            self.byId(config.edit)?.setEnabled(false);
            self.byId(config.delete)?.setEnabled(false);
            self.byId(config.add)?.setEnabled(true);
            console.log(`[MULTI-CANCEL] Buttons remain enabled (${sRemainingPathAfterCancel.split(',').length} rows still in edit)`);
        } else {
            // All rows canceled - disable Save/Cancel
            self.byId(config.save)?.setEnabled(false);
            self.byId(config.cancel)?.setEnabled(false);
            self.byId(config.edit)?.setEnabled(false);
            self.byId(config.delete)?.setEnabled(false);
            self.byId(config.add)?.setEnabled(true);
            // Clear selection only if all rows are canceled
            oTable.clearSelection();
            console.log(`[MULTI-CANCEL] All rows canceled, buttons disabled`);
        }

        // 6. Reset binding changes per SAP pattern, then force table refresh to exit edit mode
        try {
            // Reset pending changes at binding level
            const oBinding = oTable.getBinding("items");
            const oRowBinding = oTable.getRowBinding && oTable.getRowBinding();
            if (oBinding && oBinding.resetChanges) {
                oBinding.resetChanges();
                console.log("[MULTI-CANCEL] Binding changes reset");
            }
            if (oRowBinding && oRowBinding.resetChanges) {
                oRowBinding.resetChanges();
                console.log("[MULTI-CANCEL] Row binding changes reset");
            }

            // Force refresh all bindings
            if (oBinding) { oBinding.refresh(true); }
            if (oRowBinding) { oRowBinding.refresh(true); }

            // Force refresh the table itself
            if (oTable.refresh) {
                oTable.refresh();
            }

            // Clear selection to ensure clean state
            oTable.clearSelection();

            // Force a complete table rebind to exit edit mode
            setTimeout(() => {
                try {
                    const oBinding2 = oTable.getBinding("items");
                    if (oBinding2) {
                        oBinding2.refresh();
                    }
                    console.log("[MULTI-CANCEL] Secondary refresh completed");
                } catch (e) {
                    console.warn("[MULTI-CANCEL] Secondary refresh error:", e);
                }
            }, 100);

            console.log("[MULTI-CANCEL] Table refreshed and selection cleared");
        } catch (refreshError) {
            console.warn("[MULTI-CANCEL] Error refreshing table:", refreshError);
        }

        // 7. Additional verification
        setTimeout(() => {
            console.log("=== [Controller] Post-cancel state check ===");
            console.log("Edit Model after cancel:", oEditModel.getData());
            console.log("Save Button Enabled:", self.byId(config.save)?.getEnabled());
            console.log("Cancel Button Enabled:", self.byId(config.cancel)?.getEnabled());
        }, 200);

        // 8. 🚨 CRITICAL: Force refresh from database to show original data
        const oBinding = oTable.getBinding("items");
        if (oBinding) {
            // Force refresh from server to get original data
            oBinding.refresh(true); // true = force refresh from server
            console.log("[MULTI-CANCEL] Forced table refresh from database to show original data");
        }

        // 9. Force exit edit mode completely
        try {
            // Force all cells to exit edit mode
            const oInnerTable = oTable._oTable;
            if (oInnerTable && oInnerTable.getItems) {
                const aItems = oInnerTable.getItems();
                aItems.forEach(item => {
                    if (item.getCells) {
                        item.getCells().forEach(cell => {
                            if (cell.setEditable) {
                                cell.setEditable(false);
                            }
                        });
                    }
                });
            }

            console.log("[MULTI-CANCEL] Forced exit from edit mode");
        } catch (editModeError) {
            console.warn("[MULTI-CANCEL] Error forcing exit from edit mode:", editModeError);
        }

        // 10. Additional refresh to ensure UI shows original data
        setTimeout(() => {
            if (oBinding) {
                oBinding.refresh(true);
                console.log("[MULTI-CANCEL] Secondary refresh from database");
            }
        }, 100);

        if (!bSkipConfirmation) {
            sap.m.MessageToast.show("Changes discarded successfully.");
        }
    } catch (error) {
        console.error("Error during cancel operation:", error);
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        if (!bSkipConfirmation) {
            sap.m.MessageBox.error(`Error discarding changes: ${error.message}. Please check console for details.`);
        }
    }
},
```

### 2. Update Cancel Button Press Method (`onCancelButtonPress`)

Replace your existing `onCancelButtonPress` method with this updated version:

```javascript
// ✅ Public method: Cancel button press (shows confirmation dialog)
onCancelButtonPress: function (oEvent) {
    // ✅ FIXED: Store reference to this (which is the controller when delegated)
    // When called from fragment via controller delegation, 'this' is the controller instance
    const oController = this;
    
    // Button mapping for all tables
    const buttonMap = {
        "Customers": { edit: "btnEdit_cus", delete: "btnDelete_cus", save: "saveButton", cancel: "cancelButton", add: "btnAdd" },
        "Employees": { edit: "Edit_emp", delete: "Delete_emp", save: "saveButton_emp", cancel: "cancelButton_emp", add: "btnAdd_emp" },
        "Opportunities": { edit: "btnEdit_oppr", delete: "btnDelete_oppr", save: "saveButton_oppr", cancel: "cancelButton_oppr", add: "btnAdd_oppr" },
        "Projects": { edit: "btnEdit_proj", delete: "btnDelete_proj", save: "saveButton_proj", cancel: "cancelButton_proj", add: "btnAdd_proj" },
        "SAPIdStatuses": { edit: "btnEdit_sap", delete: "btnDelete_sap", save: "saveButton_sap", cancel: "cancelButton_sap", add: "btnAdd_sap" }
    };

    // Determine which table this cancel is for
    let sTableId = "Customers"; // Default fallback
    if (oEvent && oEvent.getSource) {
        const sButtonId = oEvent.getSource().getId().split("--").pop();
        sTableId = Object.keys(buttonMap).find(tableId => buttonMap[tableId].cancel === sButtonId) || "Customers";
    }

    sap.m.MessageBox.confirm(
        "Are you sure you want to cancel? Unsaved changes will be lost.",
        {
            icon: sap.m.MessageBox.Icon.WARNING,
            title: "Cancel Edit",
            actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
            onClose: function (sAction) {
                if (sAction === sap.m.MessageBox.Action.YES) {
                    // ✅ FIXED: Call _performCancelOperation on the controller instance
                    // The method must be exposed in Home.controller.js (see Step 3 below)
                    oController._performCancelOperation(sTableId, false);
                }
            }
        }
    );
},
```

### 3. Expose `_performCancelOperation` in Home.controller.js

**IMPORTANT:** You must expose `_performCancelOperation` in your controller so the cancel button can access it:

In `Home.controller.js`, add this line where other CustomUtility methods are exposed:

```javascript
// Include all methods from CustomUtility
initializeTable: CustomUtility.prototype.initializeTable,
_getPersonsBinding: CustomUtility.prototype._getPersonsBinding,
_getSelectedContexts: CustomUtility.prototype._getSelectedContexts,
_updateSelectionState: CustomUtility.prototype._updateSelectionState,
_updatePendingState: CustomUtility.prototype._updatePendingState,
onSelectionChange: CustomUtility.prototype.onSelectionChange,
onDeletePress: CustomUtility.prototype.onDeletePress,
onEditPress: CustomUtility.prototype.onEditPress,
onSaveButtonPress: CustomUtility.prototype.onSaveButtonPress,
onCancelButtonPress: CustomUtility.prototype.onCancelButtonPress,
_performCancelOperation: CustomUtility.prototype._performCancelOperation, // ✅ REQUIRED: For cancel button to work
onAdd: CustomUtility.prototype.onAdd,
// ... other methods
```

---

## Key Features

### ✅ What This Fix Does:

1. **Prevents Data Loss**: Checks for unsaved changes before navigation
2. **User Choice**: Provides three clear options (Save/Cancel/Stay)
3. **Proper Cancel**: Actually cancels OData pending changes (not just UI state)
4. **Proper Save**: Saves changes using the existing save logic
5. **Clean Navigation**: Clears edit state before navigating to prevent conflicts

### 🔧 Implementation Notes:

- The `bSkipConfirmation` parameter in `_performCancelOperation` prevents duplicate confirmation dialogs when called from navigation
- All three actions (Save/Cancel/Stay) properly handle the edit model state
- The cancel operation resets OData bindings and refreshes from the server to ensure data consistency
- Button states are properly updated after operations complete

### 📝 Important:

- Make sure your `edit` model structure matches (table-scoped `editingPath` and `mode`)
- Update the `pageToTableMap` to match your actual page keys and table IDs
- Update the `buttonMap` objects to match your actual button IDs

---

## Testing Checklist

After implementing these changes, test the following scenarios:

- [ ] Edit a row, navigate away → Should show dialog
- [ ] Click "Stay" → Should remain on current page
- [ ] Click "Save" → Should save changes, then navigate
- [ ] Click "Cancel" → Should discard changes, then navigate
- [ ] Edit multiple rows, navigate away → Should handle all rows correctly
- [ ] Add new row, navigate away → Should handle new row correctly
- [ ] No unsaved changes, navigate → Should navigate immediately (no dialog)

---

## Important Notes

### ⚠️ CRITICAL: Expose `_performCancelOperation` in Controller

**You MUST expose `_performCancelOperation` in your `Home.controller.js` file** for the cancel button to work properly. Without this, you will get an error: `_performCancelOperation is not a function`.

#### Step 1: Add `_performCancelOperation` to CustomUtility.js

The `_performCancelOperation` method must be defined in `CustomUtility.js` (see Section 3.1 above).

#### Step 2: Expose it in Home.controller.js

In `Home.controller.js`, find where other CustomUtility methods are exposed (usually at the end of the controller definition) and add:

```javascript
onSaveButtonPress: CustomUtility.prototype.onSaveButtonPress,
onCancelButtonPress: CustomUtility.prototype.onCancelButtonPress,
_performCancelOperation: CustomUtility.prototype._performCancelOperation, // ✅ REQUIRED: For cancel button to work
onAdd: CustomUtility.prototype.onAdd,
```

#### Step 3: Update `onCancelButtonPress` in CustomUtility.js

Make sure your `onCancelButtonPress` method stores the controller reference:

```javascript
onCancelButtonPress: function (oEvent) {
    const oController = this; // Store reference (controller when delegated)
    // ... rest of code
    onClose: function (sAction) {
        if (sAction === sap.m.MessageBox.Action.YES) {
            oController._performCancelOperation(sTableId, false); // Call via controller
        }
    }
}
```

### Why This Is Needed

When the cancel button is pressed from a fragment:
1. Fragment calls `press="onCancelButtonPress"` → Routes to controller
2. Controller delegates to `CustomUtility.prototype.onCancelButtonPress`
3. Inside that method, `this` refers to the controller instance
4. The controller needs `_performCancelOperation` exposed to call it

**Without exposing it, the error `_performCancelOperation is not a function` will occur.**

### Troubleshooting

If cancel button still doesn't work:
- ✅ Check that `_performCancelOperation` is defined in `CustomUtility.js`
- ✅ Check that `_performCancelOperation` is exposed in `Home.controller.js`
- ✅ Check browser console for errors
- ✅ Verify `onCancelButtonPress` stores `const oController = this` at the start
- ✅ Verify `onCancelButtonPress` calls `oController._performCancelOperation(...)`

---

**Last Updated**: 2024-11-02  
**Version**: 1.1 (Added cancel button fix - `_performCancelOperation` exposure requirement)

