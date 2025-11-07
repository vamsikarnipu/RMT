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

    // ✅ ENUM CONFIGURATION: Static values for enum fields
    GenericTableDelegate._getEnumConfig = function(sTableId, sPropertyName) {
        const mEnumFields = {
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

        const sTableId = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Projects";
        
        const mAssociationFields = {
            "Projects": {
                "oppId": { targetEntity: "Opportunities", displayField: "opportunityName", keyField: "sapOpportunityId" },
                "gpm": { targetEntity: "Employees", displayField: "fullName", keyField: "ohrId" }
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

    // ✅ SHARED LABEL FORMATTER: Ensures consistent labels across fetchProperties and getFilterDelegate
    GenericTableDelegate._formatPropertyLabel = function(sTableId, sPropertyName) {
        // Custom header mapping
        const mCustomHeaders = {
            "sapPId": "SAP PID",
            "sfdcPId": "SFDC PID",
            "projectName": "Project Name",
            "startDate": "Start Date",
            "endDate": "End Date",
            "gpm": "GPM",
            "projectType": "Project Type",
            "oppId": "Opp Name",
            "status": "Project Status"
        };

        if (mCustomHeaders[sPropertyName]) {
            return mCustomHeaders[sPropertyName];
        }

        // Smart fallback formatting (same as in getFilterDelegate)
        return String(sPropertyName)
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, function (str) { return str.toUpperCase(); })
            .trim();
    };

    GenericTableDelegate.fetchProperties = function (oTable) {
        console.log("=== [AllocationsTableDelegate] fetchProperties called ===");

        const oModel = oTable.getModel();
        if (!oModel) {
            console.error("[AllocationsTableDelegate] No model found on table");
            return Promise.resolve([]);
        }

        const oMetaModel = oModel.getMetaModel();
        console.log("[AllocationsTableDelegate] MetaModel:", oMetaModel);

        // Get collection path from payload
        const sCollectionPath = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Projects";
        console.log("[AllocationsTableDelegate] Collection Path:", sCollectionPath);

        // Wait for metadata to be loaded
        return oMetaModel.requestObject(`/${sCollectionPath}/$Type`)
            .then(function (sEntityTypePath) {
                console.log("[AllocationsTableDelegate] Entity Type Path:", sEntityTypePath);

                // Request the entity type definition
                return oMetaModel.requestObject(`/${sEntityTypePath}/`);
            })
            .then(function (oEntityType) {
                console.log("[AllocationsTableDelegate] Entity Type loaded:", oEntityType);

                const aProperties = [];

                // Iterate through entity type properties
                Object.keys(oEntityType).forEach(function (sPropertyName) {
                    // Skip metadata properties that start with $
                    if (sPropertyName.startsWith("$")) {
                        return;
                    }

                    const oProperty = oEntityType[sPropertyName];
                    console.log("[AllocationsTableDelegate] Processing property:", sPropertyName, oProperty);

                    // Check if it's a property (not a navigation property)
                    if (oProperty.$kind === "Property" || !oProperty.$kind) {
                        const sType = oProperty.$Type || "Edm.String";
                        
                        // ✅ Use shared formatter to ensure label matches getFilterDelegate
                        const sLabel = GenericTableDelegate._formatPropertyLabel(sCollectionPath, sPropertyName);

                        // Include all necessary attributes for sorting/filtering
                        aProperties.push({
                            name: sPropertyName,
                            path: sPropertyName,
                            label: sLabel, // ✅ Use formatted label
                            dataType: sType,
                            sortable: true,
                            filterable: true,
                            groupable: true,
                            maxConditions: -1,
                            caseSensitive: sType === "Edm.String" ? false : undefined
                        });
                    }
                });

                console.log("[AllocationsTableDelegate] Final properties array:", aProperties);
                return aProperties;
            })
            .catch(function (oError) {
                console.error("[AllocationsTableDelegate] Error fetching properties:", oError);
                return [];
            });
    };

    GenericTableDelegate.updateBindingInfo = function (oTable, oBindingInfo) {
        ODataTableDelegate.updateBindingInfo.apply(this, arguments);

        const sPath = oTable.getPayload()?.collectionPath || "Projects";
        oBindingInfo.path = "/" + sPath;

        // Essential OData V4 parameters
        oBindingInfo.parameters = Object.assign(oBindingInfo.parameters || {}, {
            $count: true
        });
        
        // ✅ Expand associations to load related entity names
        const sCollectionPath = sPath.replace(/^\//, "");
        if (sCollectionPath === "Projects") {
            // Expand Opportunity and GPM associations for Project table
            oBindingInfo.parameters.$expand = "to_Opportunity,to_GPM";
        }

        console.log("[AllocationsTableDelegate] updateBindingInfo - path:", sPath, "bindingInfo:", oBindingInfo);
        console.log("[AllocationsTableDelegate] Expanded associations: to_Opportunity,to_GPM");
    };

    GenericTableDelegate.addItem = function (oTable, sPropertyName, mPropertyBag) {
        console.log("[AllocationsTableDelegate] addItem called for property:", sPropertyName);

        return this.fetchProperties(oTable).then(function (aProperties) {
            const oProperty = aProperties.find(function (p) {
                return p.name === sPropertyName || p.path === sPropertyName;
            });

            if (!oProperty) {
                console.error("[AllocationsTableDelegate] Property not found:", sPropertyName);
                return Promise.reject("Property not found: " + sPropertyName);
            }

            // Custom header mapping for Projects table
            const mCustomHeaders = {
                "sapPId": "SAP PID",
                "sfdcPId": "SFDC PID",
                "projectName": "Project Name",
                "startDate": "Start Date",
                "endDate": "End Date",
                "gpm": "GPM",
                "projectType": "Project Type",
                "oppId": "Opp Name",
                "status": "Project Status"
            };

            // Smart header generation with better fallback
            let sLabel;
            let sTooltip;

            if (mCustomHeaders[sPropertyName]) {
                sLabel = mCustomHeaders[sPropertyName];
                sTooltip = sLabel;
            } else {
                sLabel = sPropertyName
                    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
                    .replace(/([a-z])([A-Z])/g, '$1 $2')
                    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();

                sTooltip = `${sLabel} (Field: ${sPropertyName})`;
            }

            oProperty.label = sLabel;
            oProperty.tooltip = sTooltip;

            // Load the Column module and create column
            return new Promise(function (resolve) {
                sap.ui.require(["sap/ui/mdc/table/Column"], function (Column) {
                    const sTableId = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Projects";
                    
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
                            console.log("[AllocationsTableDelegate] Enum field detected:", sPropertyName, "→ ComboBox");
                        } else if (bIsAssoc) {
                            // ✅ ASSOCIATION: Display name from association
                            let sAssocPath = "";
                            if (sPropertyName === "oppId") {
                                sAssocPath = "to_Opportunity/opportunityName";
                            } else if (sPropertyName === "gpm") {
                                sAssocPath = "to_GPM/fullName";
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
                            
                            oComboBox.setModel(oModel);

                            const fnAssocNameFormatter = function(sId) {
                                if (!sId) return "";
                                const oContext = this.getBindingContext();
                                if (oContext) {
                                    try {
                                        const oRowData = oContext.getObject();
                                        const sAssocEntity = sAssocPath.split("/")[0];
                                        const sAssocField = sAssocPath.split("/")[1];
                                        
                                        if (oRowData[sAssocEntity] && oRowData[sAssocEntity][sAssocField]) {
                                            return oRowData[sAssocEntity][sAssocField];
                                        }
                                    } catch (e) {
                                        // Association not expanded, will use fallback
                                    }
                                }
                                return sId;
                            };
                            
                            oField = new Field({
                                value: {
                                    path: sPropertyName,
                                    formatter: fnAssocNameFormatter
                                },
                                additionalValue: "{" + sAssocPath + "}",
                                contentEdit: oComboBox,
                                editMode: {
                                    parts: [{ path: `edit>/${sTableId}/editingPath` }],
                                    mode: "TwoWay",
                                    formatter: fnEditModeFormatter
                                }
                            });
                            console.log("[AllocationsTableDelegate] Association field detected:", sPropertyName, "→ Displaying", sAssocPath);
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

                        console.log("[AllocationsTableDelegate] Column created via addItem:", sPropertyName);
                        resolve(oColumn);
                    }).catch(function(oError) {
                        console.warn("[AllocationsTableDelegate] Error, using regular field:", oError);
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
        console.log("[AllocationsTableDelegate] removeItem called for column:", oColumn);

        if (oColumn) {
            oColumn.destroy();
        }

        return Promise.resolve(true);
    };

    // Provide FilterField creation for Adaptation Filter panel in table p13n
    GenericTableDelegate.getFilterDelegate = function () {
        return {
            addItem: function (vArg1, vArg2, vArg3) {
                var oTable = (vArg1 && typeof vArg1.isA === "function" && vArg1.isA("sap.ui.mdc.Table")) ? vArg1 : vArg2;
                var vProperty = (oTable === vArg1) ? vArg2 : vArg1;
                var mPropertyBag = vArg3;

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
                        const sCollectionPath = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Projects";
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

                // ✅ Use shared formatter to ensure label matches fetchProperties
                const sCollectionPath = oTable.getPayload()?.collectionPath?.replace(/^\//, "") || "Projects";
                const sLabel = GenericTableDelegate._formatPropertyLabel(sCollectionPath, sName);

                return Promise.resolve(new FilterField({
                    label: sLabel, // ✅ Use same formatter as fetchProperties
                    propertyKey: sName,
                    conditions: "{$filters>/conditions/" + sName + "}",
                    dataType: sDataType
                }));
            }
        };
    };

    return GenericTableDelegate;
});
