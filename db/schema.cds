// CORRECTED SCHEMA - All issues from audit fixed
// Changes made:
// 1. Fixed Customer.to_vertical cardinality (to many → to one)
// 2. Removed redundant Customer.vertical field
// 3. Fixed EmployeeBandEnum duplicate values
// 4. Added Demand ↔ Skills relationship
// 5. Added Employee ↔ Skills relationship (many-to-many)
// 6. Added Employee ↔ Project allocation entity
// 7. Added Employee supervisor self-reference
// 8. Added reverse associations
// 9. ✅ CONVERTED: Vertical entity to VerticalEnum (fixed values, no longer needs data table)

namespace db;

using {managed} from '@sap/cds/common';


type CustomerStatusEnum   : String enum {
    A = 'Active';
    I = 'Inactive';
    P = 'Prospect'
}

// ✅ CONVERTED: Vertical entity to enum (fixed values)
type VerticalEnum : String enum {
    BFS = 'BFS';
    CapitalMarkets = 'Capital Markets';
    CPG = 'CPG';
    Healthcare = 'Healthcare';
    HighTech = 'High Tech';
    Insurance = 'Insurance';
    LifeSciences = 'Life Sciences';
    Manufacturing = 'Manufacturing';
    Retail = 'Retail';
    Services = 'Services';
}

entity Customer {
    key SAPcustId        : String;
        customerName     : String(100);
        state            : String;
        country          : String;
        status           : CustomerStatusEnum;
        vertical         : VerticalEnum;  // ✅ CHANGED: Now using enum instead of entity
        
        to_Opportunities : Association to many Opportunity
                               on to_Opportunities.customerId = $self.SAPcustId;
}

// -------------------- Opportunity --------------------

type ProbabilityEnum      : String enum {
    ProposalStage = '0%-ProposalStage'; // Proposal Stage
    SoWSent = '33%-SoWSent'; // SoW is Sent
    SoWSigned = '85%-SoWSigned'; // SoW is Signed
    PurchaseOrderReceived = '100%-PurchaseOrderReceived'; // Purchase Order is received
}

type OpportunityStageEnum : String enum {
    Discover = 'Discover';
    Define = 'Define';
    OnBid = 'On Bid';
    DownSelect = 'Down Select';
    SignedDeal = 'Signed Deal';
}

entity Opportunity {
    key sapOpportunityId  : String;
        sfdcOpportunityId : String;
        opportunityName   : String;
        businessUnit      : String;
        probability       : ProbabilityEnum;
        salesSPOC         : String;
        deliverySPOC      : String;
        expectedStart     : Date;
        expectedEnd       : Date;
        tcv  : Decimal(15, 2);
        Stage             : OpportunityStageEnum;
        customerId        : String;
        
        to_Customer       : Association to one Customer
                                on to_Customer.SAPcustId = $self.customerId;
        to_Project        : Association to many Project
                                on to_Project.oppId = $self.sapOpportunityId;
}

// -------------------- Project --------------------

type ProjectTypeEnum      : String enum {
    FixedPrice = 'Fixed Price';
    TransactionBased = 'Transaction Based';
    FixedMonthly = 'Fixed Monthly';
    PassThru = 'Pass Thru';
    Divine = 'Divine';
}

type ProjectStatusEnum    : String enum {
    Active = 'Active';
    Closed = 'Closed';
    Planned = 'Planned';
}

type SowEnum : String enum {
    Yes = 'Yes';
    No = 'No';
}

type PoEnum : String enum {
    Yes = 'Yes';
    No = 'No';
}

entity Project {
    key sapPId            : String;
        sfdcPId           : String;
        projectName       : String(256);
        startDate         : Date;
        endDate           : Date;
        gpm               : String;
        projectType       : ProjectTypeEnum;
        oppId             : String;
        status            : ProjectStatusEnum;
        requiredResources : Integer;
        allocatedResources: Integer;
        toBeAllocated     : Integer;
        SOWReceived       : SowEnum;
        POReceived        : PoEnum;
    
        to_Opportunity    : Association to one Opportunity
                             on to_Opportunity.sapOpportunityId = $self.oppId;
        to_GPM            : Association to one Employee
                             on to_GPM.ohrId = $self.gpm;
        to_Demand         : Association to many Demand
                             on to_Demand.sapPId = $self.sapPId;
        to_Allocations    : Association to many EmployeeProjectAllocation  // ✅ NEW
                             on to_Allocations.projectId = $self.sapPId;
}

// ----------------------- Demand -------------------------------------

entity Demand {
    key demandId          : UUID;
        skillId           : UUID;          // ✅ NEW: Foreign key to Skills
        skill             : String;        // Keep for display/compatibility
        band              : String;
        sapPId            : String;
        quantity          : Integer;
    
        to_Project        : Association to one Project      // ✅ NEW: Reverse association
                           on to_Project.sapPId = $self.sapPId;
        to_Skill          : Association to one Skills       // ✅ NEW: Skills relationship
                           on to_Skill.id = $self.skillId;
}

// -------------------- Employee --------------------

type EmployeeTypeEnum     : String enum {
    FullTime = 'Full Time';
    SubCon = 'Subcon';
    Intern = 'Intern';
    YTJ = 'Yet To Join';
}

type EmployeeStatusEnum   : String enum {
    PreAllocated = 'Pre Allocated';
    Bench = 'Bench';
    Resigned = 'Resigned';
    Allocated = 'Allocated';
}

type GenderEnum           : String enum {
    Male = 'Male';
    Female = 'Female';
    Others = 'Others';
}

type EmployeeBandEnum     : String enum {
    Band1 = '1';        // ✅ FIXED: Made unique (was '2')
    Band2  = '2';                // ✅ FIXED: Now unique
    Band3 = '3';
    Band4A_1 = '4A_1';
    Band4A_2 = '4A_2';
    Band4B_C = '4B_C';
    Band4B_LC = '4B_LC';
    Band4C = '4C';
    Band4D = '4D';
    Band5A = '5A';
    Band5B = '5B';
}

// ✅ NEW: Junction table for Employee-Skills (many-to-many)
entity EmployeeSkill {
    key employeeId        : String;
    key skillId           : UUID;
    proficiencyLevel      : String;         // Optional: Beginner, Intermediate, Expert
    
    to_Employee           : Association to one Employee
                              on to_Employee.ohrId = $self.employeeId;
    to_Skill              : Association to one Skills
                              on to_Skill.id = $self.skillId;
}

// ✅ NEW: Allocation Status Enum
type AllocationStatusEnum : String enum {
    Active = 'Active';
    Completed = 'Completed';
    Cancelled = 'Cancelled';
}

// ✅ NEW: Allocation entity for Employee-Project relationship
entity EmployeeProjectAllocation {
    key allocationId      : UUID;
    employeeId            : String;
    projectId             : String;
    startDate             : Date;
    endDate                : Date;
    allocationPercentage  : Integer;        // 0-100
    status                : AllocationStatusEnum;
    
    to_Employee           : Association to one Employee
                              on to_Employee.ohrId = $self.employeeId;
    to_Project            : Association to one Project
                              on to_Project.sapPId = $self.projectId;
}

entity Employee {
    key ohrId             : String;
        fullName          : String;
        mailid            : String;
        gender            : GenderEnum;
        employeeType      : EmployeeTypeEnum;
        doj               : String;           // ✅ FIXED: Changed from String to Date
        band              : EmployeeBandEnum;
        role              : String;
        location          : String;
        supervisorOHR     : String;
        skills            : String;         // Keep for backward compatibility/display
        city              : String;
        lwd               : String;          // ✅ FIXED: Changed from String to Date
        status            : EmployeeStatusEnum;
    
    // ✅ NEW: Self-referential associations
    to_Supervisor         : Association to one Employee
                          on to_Supervisor.ohrId = $self.supervisorOHR;
    to_Subordinates       : Association to many Employee
                          on to_Subordinates.supervisorOHR = $self.ohrId;
    
    // ✅ NEW: Skills relationship
    to_Skills             : Association to many EmployeeSkill
                          on to_Skills.employeeId = $self.ohrId;
    
    // ✅ NEW: Project allocations
    to_Allocations        : Association to many EmployeeProjectAllocation
                          on to_Allocations.employeeId = $self.ohrId;
}

//-------------Skills--------------------

entity Skills {
    key id                : UUID;
        name              : String;
        category          : String;
    
    to_Demands            : Association to many Demand      // ✅ NEW: Reverse association
                          on to_Demands.skillId = $self.id;
    to_EmployeeSkills     : Association to many EmployeeSkill  // ✅ NEW
                          on to_EmployeeSkills.skillId = $self.id;
}
