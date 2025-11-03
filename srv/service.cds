using db from '../db/schema';

service MyService {
  // Master Data Entities
  entity Customers     as projection on db.Customer;
  entity Opportunities as projection on db.Opportunity;
  entity Projects      as projection on db.Project;
  entity Employees     as projection on db.Employee;
  // ✅ REMOVED: Verticals (now an enum, not an entity)
  entity Demands       as projection on db.Demand;
  
  // ✅ ADDED: Skills Master Data
  entity Skills        as projection on db.Skills;
  
  // ✅ ADDED: Employee-Skills Junction Table (Many-to-Many)
  entity EmployeeSkills as projection on db.EmployeeSkill;
  
  // ✅ ADDED: Employee-Project Allocations
  entity Allocations   as projection on db.EmployeeProjectAllocation;
}
