sap.ui.define([
    "sap/ui/mdc/odata/v4/TableDelegate",
    "sap/ui/model/Sorter",
    "sap/ui/mdc/FilterField",
    "sap/ui/mdc/Field",
    "sap/ui/mdc/library",
    "sap/m/HBox",
    "sap/m/Button",
    "sap/m/library",
    "sap/m/ComboBox",
    "sap/ui/core/Item"
], function (ODataTableDelegate, Sorter, FilterField, Field, mdcLibrary, HBox, Button, mLibrary, ComboBox, Item) {
    "use strict";

    const GenericTableDelegate = Object.assign({}, ODataTableDelegate);

    // ✅ ENUM CONFIGURATION: Static values for enum fields (shared with CustomersTableDelegate)
    GenericTableDelegate._getEnumConfig = function(sTableId, sPropertyName) {
        const mEnumFields = {
            "Customers": {
                "status": { values: ["A", "I", "P"], labels: ["Active", "Inactive", "Prospect"] },
                "vertical": { 
                    values: ["BFS", "CapitalMarkets", "CPG", "Healthcare", "HighTech", "Insurance", "LifeSciences", "Manufacturing", "Retail", "Services"],
                    labels: ["BFS", "Capital Markets", "CPG", "Healthcare", "High Tech", "Insurance", "Life Sciences", "Manufacturing", "Retail", "Services"]
                }
            },
            "Opportunities": {
                "probability": { 
                    values: ["ProposalStage", "SoWSent", "SoWSigned", "PurchaseOrderReceived"],
                    labels: ["0%-ProposalStage", "33%-SoWSent", "85%-SoWSigned", "100%-PurchaseOrderReceived"]
                },
                "Stage": { 
                    values: ["Discover", "Define", "OnBid", "DownSelect", "SignedDeal"],
                    labels: ["Discover", "Define", "On Bid", "Down Select", "Signed Deal"]
                }
            },
            "Projects": {
                "projectType": { 
                    values: ["FixedPrice", "TransactionBased", "FixedMonthly", "PassThru", "Divine"],
                    labels: ["Fixed Price", "Transaction Based", "Fixed Monthly", "Pass Thru", "Divine"]
                },
                "status": { 
                    values: ["Active", "Closed", "Planned"],
                    labels: ["Active", "Closed", "Planned"]
                },
                "SOWReceived": { 
                    values: ["Yes", "No"],
                    labels: ["Yes", "No"]
                },
                "POReceived": { 
                    values: ["Yes", "No"],
                    labels: ["Yes", "No"]
                }
            },
            "Employees": {
                "gender": { 
                    values: ["Male", "Female", "Others"],
                    labels: ["Male", "Female", "Others"]
                },
                "employeeType": { 
                    values: ["FullTime", "SubCon", "Intern", "YTJ"],
                    labels: ["Full Time", "Subcon", "Intern", "Yet To Join"]
                },
                "band": { 
                    values: ["1", "2", "3", "Band4A_1", "Band4A_2", "Band4B_C", "Band4B_LC", "Band4C", "Band4D", "Band5A", "Band5B"],
                    labels: ["1", "2", "3", "4A_1", "4A_2", "4B_C", "4B_LC", "4C", "4D", "5A", "5B"]
                },
                "status": { 
                    values: ["PreAllocated", "Bench", "Resigned", "Allocated"],
                    labels: ["Pre Allocated", "Bench", "Resigned", "Allocated"]
                }
            },
            "Allocations": {
                "status": { 
                    values: ["Active", "Completed", "Cancelled"],
                    labels: ["Active", "Completed", "Cancelled"]
                }
            }
        };
        return mEnumFields[sTableId]?.[sPropertyName] || null;
    };

    // ✅ ASSOCIATION DETECTION: Dynamic detection from OData metadata
    GenericTableDelegate._detectAssociation = function(oTable, sPropertyName) {
        const oModel = oTable.getModel();
        if (!oModel || !oModel.getMetaModel) {
            return Promise.resolve(null);
        }

        const sTableId = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Opportunities";
        
        const mAssociationFields = {
            "Opportunities": {
                "customerId": { targetEntity: "Customers", displayField: "customerName", keyField: "SAPcustId" }
            },
            "Projects": {
                "oppId": { targetEntity: "Opportunities", displayField: "opportunityName", keyField: "sapOpportunityId" }
            },
            "Demands": {
                "skillId": { targetEntity: "Skills", displayField: "name", keyField: "id" },
                "sapPId": { targetEntity: "Projects", displayField: "projectName", keyField: "sapPId" }
            },
            "Employees": {
                "supervisorOHR": { targetEntity: "Employees", displayField: "fullName", keyField: "ohrId" }
            },
            "EmployeeSkills": {
                "employeeId": { targetEntity: "Employees", displayField: "fullName", keyField: "ohrId" },
                "skillId": { targetEntity: "Skills", displayField: "name", keyField: "id" }
            },
            "Allocations": {
                "employeeId": { targetEntity: "Employees", displayField: "fullName", keyField: "ohrId" },
                "projectId": { targetEntity: "Projects", displayField: "projectName", keyField: "sapPId" }
            }
        };

        const oAssocConfig = mAssociationFields[sTableId]?.[sPropertyName];
        return Promise.resolve(oAssocConfig || null);
    };

    // Ensure Table advertises support for all desired p13n panels
    GenericTableDelegate.getSupportedP13nModes = function () {
        return ["Column", "Sort", "Filter", "Group"];
    };

    GenericTableDelegate.fetchProperties = function (oTable) {
        console.log("=== [GenericDelegate] fetchProperties called ===");

        const oModel = oTable.getModel();
        if (!oModel) {
            console.error("[GenericDelegate] No model found on table");
            return Promise.resolve([]);
        }

        const oMetaModel = oModel.getMetaModel();
        console.log("[GenericDelegate] MetaModel:", oMetaModel);

        // Get collection path from payload
        const sCollectionPath = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Customers";
        console.log("[GenericDelegate] Collection Path:", sCollectionPath);

        // Wait for metadata to be loaded
        return oMetaModel.requestObject(`/${sCollectionPath}/$Type`)
            .then(function (sEntityTypePath) {
                console.log("[GenericDelegate] Entity Type Path:", sEntityTypePath);

                // Request the entity type definition
                return oMetaModel.requestObject(`/${sEntityTypePath}/`);
            })
            .then(function (oEntityType) {
                console.log("[GenericDelegate] Entity Type loaded:", oEntityType);

                const aProperties = [];

                // Iterate through entity type properties
                Object.keys(oEntityType).forEach(function (sPropertyName) {
                    // Skip metadata properties that start with $
                    if (sPropertyName.startsWith("$")) {
                        return;
                    }

                    const oProperty = oEntityType[sPropertyName];
                    console.log("[GenericDelegate] Processing property:", sPropertyName, oProperty);

                    // Check if it's a property (not a navigation property)
                    if (oProperty.$kind === "Property" || !oProperty.$kind) {
                        const sType = oProperty.$Type || "Edm.String";

                        // Include all necessary attributes for sorting/filtering
                        aProperties.push({
                            name: sPropertyName,
                            path: sPropertyName,
                            label: sPropertyName,
                            dataType: sType,
                            sortable: true,
                            filterable: true,
                            groupable: true,
                            maxConditions: -1,
                            caseSensitive: sType === "Edm.String" ? false : undefined
                        });
                    }
                });

                console.log("[GenericDelegate] Final properties array:", aProperties);
                return aProperties;
            })
            .catch(function (oError) {
                console.error("[GenericDelegate] Error fetching properties:", oError);
                console.log("[GenericDelegate] Using fallback properties for", sCollectionPath);

                // Fallback properties for Opportunities
                const mFallbackProperties = {
                    "Opportunities": [
                        { name: "sapOpportunityId", path: "sapOpportunityId", label: "SAP Opportunity ID", dataType: "Edm.Int32", sortable: true, filterable: true, groupable: true },
                        { name: "sfdcOpportunityId", path: "sfdcOpportunityId", label: "SFDC Opportunity ID", dataType: "Edm.String", sortable: true, filterable: true, groupable: true },
                        { name: "probability", path: "probability", label: "Probability", dataType: "Edm.String", sortable: true, filterable: true, groupable: true },
                        { name: "salesSPOC", path: "salesSPOC", label: "Sales SPOC", dataType: "Edm.String", sortable: true, filterable: true, groupable: true },
                        { name: "deliverySPOC", path: "deliverySPOC", label: "Delivery SPOC", dataType: "Edm.String", sortable: true, filterable: true, groupable: true },
                        { name: "expectedStart", path: "expectedStart", label: "Expected Start", dataType: "Edm.Date", sortable: true, filterable: true, groupable: true },
                        { name: "expectedEnd", path: "expectedEnd", label: "Expected End", dataType: "Edm.Date", sortable: true, filterable: true, groupable: true },
                        { name: "customerId", path: "customerId", label: "Customer ID", dataType: "Edm.Int32", sortable: true, filterable: true, groupable: true }
                    ]
                };

                return mFallbackProperties[sCollectionPath] || [];
            });
    };

    GenericTableDelegate.updateBindingInfo = function (oTable, oBindingInfo) {
        ODataTableDelegate.updateBindingInfo.apply(this, arguments);

        const sPath = oTable.getPayload()?.collectionPath || "Customers";
        oBindingInfo.path = "/" + sPath;

        // Essential OData V4 parameters
        oBindingInfo.parameters = Object.assign(oBindingInfo.parameters || {}, {
            $count: true
        });
        
        // ✅ Expand associations to load related entity names
        const sCollectionPath = sPath.replace(/^\//, "");
        if (sCollectionPath === "Opportunities") {
            // Expand Customer association for Opportunity table
            oBindingInfo.parameters.$expand = "to_Customer";
        }

        console.log("[GenericDelegate] updateBindingInfo - path:", sPath, "bindingInfo:", oBindingInfo);
        console.log("[GenericDelegate] Table payload:", oTable.getPayload());
    };

    GenericTableDelegate.addItem = function (oTable, sPropertyName, mPropertyBag) {
        console.log("[GenericDelegate] addItem called for property:", sPropertyName);

        return this.fetchProperties(oTable).then(function (aProperties) {
            const oProperty = aProperties.find(function (p) {
                return p.name === sPropertyName || p.path === sPropertyName;
            });

            if (!oProperty) {
                console.error("[GenericDelegate] Property not found:", sPropertyName);
                return Promise.reject("Property not found: " + sPropertyName);
            }

            // Format label
            // const sLabel = sPropertyName
            //     // .replace(/([A-Z])/g, ' $1')
            //     .replace(/([a-z])([A-Z])/g, '$1 $2')
            //     .replace(/^./, function(str) { return str.toUpperCase(); })
            //     .trim();
            // Custom header mapping for Opportunities table
            const mCustomHeaders = {
                "sapOpportunityId": "SAP Opp. ID",
                "sfdcOpportunityId": "SFDC Opp. ID",
                "opportunityName": "Opp. Name",
                "businessUnit": "Business Unit",
                "probability": "Probability",
                "salesSPOC": "Sales SPOC",
                "deliverySPOC": "Delivery SPOC",
                "expectedStart": "Expected Start",
                "expectedEnd": "Expected End",
                "tcv":"TCV",
                "Stage": "Deal Stage",
                "customerId": "Customer Name"
            };

            // Smart header generation with better fallback
            let sLabel;
            let sTooltip;

            if (mCustomHeaders[sPropertyName]) {
                // Use custom header if available
                sLabel = mCustomHeaders[sPropertyName];
                sTooltip = sLabel; // Same as label
            } else {
                // Smart fallback for any new or unmapped fields
                sLabel = sPropertyName
                    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // "SAPId" → "SAP Id"
                    .replace(/([a-z])([A-Z])/g, '$1 $2')         // "customerName" → "Customer Name"
                    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')    // "OHRId" → "OHR Id"
                    .replace(/^./, str => str.toUpperCase())     // Capitalize first letter
                    .trim();

                sTooltip = `${sLabel} (Field: ${sPropertyName})`;

                // console.log(`[OpportunitiesTableDelegate] New field detected: "${sPropertyName}" → "${sLabel}"`);
            }

            oProperty.label = sLabel;
            oProperty.tooltip = sTooltip;


            // Load the Column module and create column
            return new Promise(function (resolve) {
                sap.ui.require(["sap/ui/mdc/table/Column"], function (Column) {
                    const sTableId = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Opportunities";
                    
                    const oEnumConfig = GenericTableDelegate._getEnumConfig(sTableId, sPropertyName);
                    const bIsEnum = !!oEnumConfig;
                    const oAssocPromise = GenericTableDelegate._detectAssociation(oTable, sPropertyName);
                    
                    const fnEditModeFormatter = function (sPath) {
                        var rowPath = this.getBindingContext() && this.getBindingContext().getPath();
                        if (sPath && sPath.includes(",")) {
                            const aEditingPaths = sPath.split(",");
                            return aEditingPaths.includes(rowPath) ? "Editable" : "Display";
                        }
                        return sPath === rowPath ? "Editable" : "Display";
                    };

                    const oEditableBinding = {
                        parts: [{ path: `edit>/${sTableId}/editingPath` }],
                        mode: "TwoWay",
                        formatter: function (sPath) {
                            var rowPath = this.getBindingContext() && this.getBindingContext().getPath();
                            if (sPath && sPath.includes(",")) {
                                const aEditingPaths = sPath.split(",");
                                return aEditingPaths.includes(rowPath);
                            }
                            return sPath === rowPath;
                        }
                    };

                    oAssocPromise.then(function(oAssocConfig) {
                        const bIsAssoc = !!oAssocConfig;
                        let oField;

                        if (bIsEnum) {
                            const aItems = oEnumConfig.values.map(function(sVal, iIndex) {
                                return new Item({
                                    key: sVal,
                                    text: oEnumConfig.labels[iIndex] || sVal
                                });
                            });
                            const oComboBox = new ComboBox({
                                value: "{" + sPropertyName + "}",
                                selectedKey: "{" + sPropertyName + "}",
                                items: aItems,
                                editable: oEditableBinding
                            });
                            oField = new Field({
                                value: "{" + sPropertyName + "}",
                                contentEdit: oComboBox,
                                editMode: {
                                    parts: [{ path: `edit>/${sTableId}/editingPath` }],
                                    mode: "TwoWay",
                                    formatter: fnEditModeFormatter
                                }
                            });
                            console.log("[GenericDelegate] Enum field detected:", sPropertyName, "→ ComboBox");
                        } else if (bIsAssoc) {
                            // ✅ ASSOCIATION: Display name from association, but store ID for editing
                            // Determine association path based on property
                            let sAssocPath = "";
                            if (sPropertyName === "customerId") {
                                sAssocPath = "to_Customer/customerName"; // Display customer name
                            } else if (sPropertyName === "supervisorOHR") {
                                sAssocPath = "to_Supervisor/fullName"; // Display supervisor name
                            } else if (sPropertyName === "oppId") {
                                sAssocPath = "to_Opportunity/opportunityName"; // Display opportunity name
                            } else {
                                // Fallback: try to construct association path
                                sAssocPath = sPropertyName.replace("Id", "").replace("OHR", "");
                                if (sAssocPath === "customer") {
                                    sAssocPath = "to_Customer/customerName";
                                } else if (sAssocPath === "opp") {
                                    sAssocPath = "to_Opportunity/opportunityName";
                                } else if (sAssocPath === "supervisor") {
                                    sAssocPath = "to_Supervisor/fullName";
                                } else {
                                    sAssocPath = sPropertyName; // Fallback to ID
                                }
                            }
                            
                            const oModel = oTable.getModel();
                            const sCollectionPath = "/" + oAssocConfig.targetEntity;
                            
                            const oComboBox = new ComboBox({
                                selectedKey: "{" + sPropertyName + "}",
                                value: "{" + sPropertyName + "}",
                                items: {
                                    path: sCollectionPath,
                                    template: new Item({
                                        key: "{" + oAssocConfig.keyField + "}",
                                        text: "{" + oAssocConfig.displayField + "}"
                                    })
                                },
                                editable: oEditableBinding,
                                showSecondaryValues: true,
                                filterSecondaryValues: true,
                                placeholder: "Select " + oAssocConfig.displayField
                            });
                            
                            // Bind to the same model as the table
                            oComboBox.setModel(oModel);

                            // Create a formatter to resolve association name with fallback
                            const fnAssocNameFormatter = function(sId) {
                                if (!sId) return "";
                                // Try to get from expanded association first
                                const oContext = this.getBindingContext();
                                if (oContext) {
                                    try {
                                        const oRowData = oContext.getObject();
                                        const sAssocEntity = sAssocPath.split("/")[0]; // e.g., "to_Customer"
                                        const sAssocField = sAssocPath.split("/")[1]; // e.g., "customerName"
                                        
                                        // Check if association is expanded
                                        if (oRowData[sAssocEntity] && oRowData[sAssocEntity][sAssocField]) {
                                            return oRowData[sAssocEntity][sAssocField];
                                        }
                                    } catch (e) {
                                        // Association not expanded, will use fallback
                                    }
                                }
                                // Fallback: return ID if name not available
                                return sId;
                            };
                            
                            // Display the name from association path with formatter fallback
                            oField = new Field({
                                value: {
                                    path: sPropertyName,
                                    formatter: fnAssocNameFormatter
                                },
                                // Also try direct association path binding as primary source
                                additionalValue: "{" + sAssocPath + "}", // Try association path
                                contentEdit: oComboBox,
                                editMode: {
                                    parts: [{ path: `edit>/${sTableId}/editingPath` }],
                                    mode: "TwoWay",
                                    formatter: fnEditModeFormatter
                                }
                            });
                            console.log("[GenericDelegate] Association field detected:", sPropertyName, "→ Displaying", sAssocPath, "from association");
                        } else {
                            oField = new Field({
                                value: "{" + sPropertyName + "}",
                                tooltip: "{" + sPropertyName + "}",
                                editMode: {
                                    parts: [{ path: `edit>/${sTableId}/editingPath` }],
                                    mode: "TwoWay",
                                    formatter: fnEditModeFormatter
                                }
                            });
                        }

                        const oColumn = new Column({
                            id: oTable.getId() + "--col-" + sPropertyName,
                            dataProperty: sPropertyName,
                            propertyKey: sPropertyName,
                            header: sLabel,
                            template: oField
                        });

                        console.log("[GenericDelegate] Column created via addItem:", sPropertyName);
                        resolve(oColumn);
                    }).catch(function(oError) {
                        console.warn("[GenericDelegate] Error, using regular field:", oError);
                        const oField = new Field({
                            value: "{" + sPropertyName + "}",
                            tooltip: "{" + sPropertyName + "}",
                            editMode: {
                                parts: [{ path: `edit>/${sTableId}/editingPath` }],
                                mode: "TwoWay",
                                formatter: fnEditModeFormatter
                            }
                        });
                        const oColumn = new Column({
                            id: oTable.getId() + "--col-" + sPropertyName,
                            dataProperty: sPropertyName,
                            propertyKey: sPropertyName,
                            header: sLabel,
                            template: oField
                        });
                        resolve(oColumn);
                    });
                });
            });
        });
    };

    GenericTableDelegate.removeItem = function (oTable, oColumn, mPropertyBag) {
        console.log("[GenericDelegate] removeItem called for column:", oColumn);

        if (oColumn) {
            oColumn.destroy();
        }

        return Promise.resolve(true);
    };

    // Provide FilterField creation for Adaptation Filter panel in table p13n
    GenericTableDelegate.getFilterDelegate = function () {
        return {
            addItem: function (vArg1, vArg2, vArg3) {
                // Normalize signature: MDC may call (oTable, vProperty, mBag) or (vProperty, oTable, mBag)
                var oTable = (vArg1 && typeof vArg1.isA === "function" && vArg1.isA("sap.ui.mdc.Table")) ? vArg1 : vArg2;
                var vProperty = (oTable === vArg1) ? vArg2 : vArg1;
                var mPropertyBag = vArg3;

                // Resolve property name from string, property object, or mPropertyBag
                const sName =
                    (typeof vProperty === "string" && vProperty) ||
                    (vProperty && (vProperty.name || vProperty.path || vProperty.key)) ||
                    (mPropertyBag && (mPropertyBag.name || mPropertyBag.propertyKey)) ||
                    (mPropertyBag && mPropertyBag.property && (mPropertyBag.property.name || mPropertyBag.property.path || mPropertyBag.property.key));
                if (!sName) {
                    return Promise.reject("Invalid property for filter item");
                }

                let sDataType = "sap.ui.model.type.String";
                try {
                    const oModel = oTable.getModel();
                    const oMetaModel = oModel && oModel.getMetaModel && oModel.getMetaModel();
                    if (oMetaModel) {
                        const sCollectionPath = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Customers";
                        const oProp = oMetaModel.getObject(`/${sCollectionPath}/${sName}`);
                        const sEdmType = oProp && oProp.$Type;
                        if (sEdmType === "Edm.Int16" || sEdmType === "Edm.Int32" || sEdmType === "Edm.Int64" || sEdmType === "Edm.Decimal") {
                            sDataType = "sap.ui.model.type.Integer";
                        } else if (sEdmType === "Edm.Boolean") {
                            sDataType = "sap.ui.model.type.Boolean";
                        } else if (sEdmType === "Edm.Date" || sEdmType === "Edm.DateTimeOffset") {
                            sDataType = "sap.ui.model.type.Date";
                        }
                    }
                } catch (e) { /* ignore */ }

                return Promise.resolve(new FilterField({
                    label: String(sName)
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, function (str) { return str.toUpperCase(); })
                        .trim(),
                    propertyKey: sName,
                    conditions: "{$filters>/conditions/" + sName + "}",
                    dataType: sDataType
                }));
            }
        };
    };

    return GenericTableDelegate;
});