using db from '../db/schema';

service MyService {
  // Master Data Entities
  entity Customers     as projection on db.Customer;
  entity Opportunities as projection on db.Opportunity;
  entity Projects      as projection on db.Project;
  entity Employees     as projection on db.Employee;
  entity Demands       as projection on db.Demand;
  
  entity Skills        as projection on db.Skills;
  
  entity EmployeeSkills as projection on db.EmployeeSkill;
  
  entity Allocations   as projection on db.EmployeeProjectAllocation;
}
