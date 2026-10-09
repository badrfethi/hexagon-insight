Feature: The hexagon's rules
  These are the rules every repository laid out in staff, suppliers and adapters is held to. They
  are the hexagon's, not any one repository's: a target provides its code and its tests in the fixed
  layout, and nothing else. A failing scenario is a break. Breaks are shown and gate nothing.

  The steps are written by agents, in `steps/`; this file is the operator's, and an agent's edit to
  it asks first (`.claude/settings.json`).

  Rule: A staff group has a contract, and a service that implements it
    Staff do their work themselves. What colleagues and the outside world depend on is the group's
    contract: an interface in `interfaces/`, or an incoming port in `incoming_ports/`.

    Scenario: every staff group has an interface or an incoming port
      Given the groups under "src/infrastructure/staff"
      Then each of them has an interface in "interfaces" or "incoming_ports"

    Scenario: every staff contract is implemented by a service in its own group
      Given the groups under "src/infrastructure/staff"
      Then each interface in their "interfaces" and "incoming_ports" folders is implemented by a class in their "services" folder

  Rule: A supplier group has outgoing ports, and an adapter that implements them
    Suppliers describe work done outside the hexagon, satisfied by an adapter. Work done outside is
    always asked for from inside, so a supplier's ports are outgoing. What drives the hexagon is an
    incoming port, and those belong to staff.

    An outgoing adapter attaches to a supplier by implementing its outgoing port, and a port may
    have several. An incoming adapter drives a port by referencing it, and may reference several.

    Scenario: every supplier group has outgoing ports, and no incoming ones
      Given the groups under "src/infrastructure/suppliers"
      Then each of them has an interface in "outgoing_ports", and no "incoming_ports" folder

    Scenario: every outgoing supplier port is implemented by an adapter
      Given the groups under "src/infrastructure/suppliers"
      Then each interface in their "outgoing_ports" folders is implemented by a class under "src/adapters"

  Rule: An outgoing adapter has a contract test, and an incoming adapter has an entry point test
    An outgoing adapter is checked against the real supplier it was written against, by a contract
    test in `contracts/`. An incoming adapter is checked at its outer surface, with the incoming port
    faked, by an entry point test in `entry-points/`. Neither has the other kind. The lane decides,
    and there is no exception: a Client standing in as the driving adapter is an incoming adapter
    with no entry point test, and shows here as a break.

    Scenario: every outgoing adapter has a contract test
      Given the outgoing adapters under "src/adapters"
      Then each of them is run by a feature under "contracts"

    Scenario: no outgoing adapter has an entry point test
      Given the outgoing adapters under "src/adapters"
      Then none of them is run by a feature under "entry-points"

    Scenario: every incoming adapter has an entry point test
      Given the incoming adapters under "src/adapters"
      Then each of them is run by a feature under "entry-points"

    Scenario: no incoming adapter has a contract test
      Given the incoming adapters under "src/adapters"
      Then none of them is run by a feature under "contracts"

  Rule: Every acceptance scenario comes in through an incoming port
    An acceptance test drives an incoming port, with a Test Double at each outgoing port. Which door
    a scenario came in is measured by running it. A test that fits none of the four kinds is the
    finding.

    Scenario: every scenario under "features" comes in through an incoming port
      Given the scenarios under "features"
      Then each of them came in through an incoming port

  Rule: A target is laid out in the hexagon's folders
    A target keeps its code in the tool's folders: staff and supplier groups under
    `src/infrastructure`, adapters under `src/adapters`, and the core, if it has one, in `src/core`.
    A language's reader may claim what its language needs beside them, such as the project that
    wires the application. Any other folder there is one the hexagon does not have. Test code that
    uses the application's code lives in one of the four test folders.

    Scenario: the hexagon's folders are there
      Given the target's root
      Then it has "src/infrastructure/staff", "src/infrastructure/suppliers", "src/adapters" and "features"

    Scenario: nothing else sits in "src"
      Given the folders directly under "src"
      Then each of them is "infrastructure", "adapters" or "core", or is claimed by the target's reader

    Scenario: nothing else sits in "src/infrastructure"
      Given the folders directly under "src/infrastructure"
      Then each of them is "staff" or "suppliers", or is claimed by the target's reader

    Scenario: test code that uses the application lives in a test folder
      Given the test code that uses code under "src"
      Then each of it is under "entry-points", "features", "core-tests" or "contracts"
